use super::{Channel, Session};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Formula {
    pub id: String,
    pub name: String,
    pub expression: String,
}
#[cfg(test)]
mod tests {
    use super::*;
    fn session() -> Session {
        Session {
            id: "s".into(),
            source: String::new(),
            name: String::new(),
            driver: String::new(),
            track: String::new(),
            recorded_at: String::new(),
            laps: vec![],
            warnings: vec![],
            channels: vec![Channel {
                id: "rpm".into(),
                name: "RPM".into(),
                unit: "rpm".into(),
                gaps: vec![],
                times: vec![0., 1., 2., 3., 4., 20., 21.],
                values: vec![0., 10., 20., 30., 40., 200., 210.],
            }],
        }
    }
    fn run(e: &str) -> Result<Channel, String> {
        evaluate(
            &session(),
            &[Formula {
                id: "d".into(),
                name: "D".into(),
                expression: e.into(),
            }],
        )
        .map(|mut c| c.remove(0))
    }
    #[test]
    fn precedence() {
        assert_eq!(run("2+3*4").unwrap().values[0], 14.);
    }
    #[test]
    fn units() {
        assert!(run("[rpm]+1").is_err());
        assert_eq!(run("[rpm]+10{rpm}").unwrap().values[1], 20.);
        assert!((run("convert(60{mph},\"km/h\")").unwrap().values[0] - 96.56064).abs() < 1e-6);
    }
    #[test]
    fn derivative_gap() {
        let c = run("derivative([rpm])").unwrap();
        assert_eq!(c.unit, "rpm/s");
        assert!(c.values[0].is_nan());
        assert_eq!(c.values[1], 10.);
        assert!(c.values[5].is_nan());
    }
    #[test]
    fn invalid() {
        assert!(run("1/0").unwrap().values[0].is_nan());
        assert!(run("sqrt(-1)").unwrap().values[0].is_nan());
        assert!(run("[missing]").unwrap_err().contains("missing"));
        assert!(run(&"(".repeat(100)).is_err());
    }
    #[test]
    fn comparisons_and_functions() {
        assert_eq!(run("60{mph} > 90{km/h}").unwrap().values[0], 1.);
        assert_eq!(run("clamp(-2,0,3)+max(2,3)+abs(-4)").unwrap().values[0], 7.);
        assert!(run("sin([rpm])").is_err());
        assert!(run("convert(1{mystery},\"mph\")").is_err());
    }
    #[test]
    fn dependency_order_and_limits() {
        let fs = vec![
            Formula {
                id: "b".into(),
                name: "B".into(),
                expression: "[a]+1{rpm}".into(),
            },
            Formula {
                id: "a".into(),
                name: "A".into(),
                expression: "[rpm]*2".into(),
            },
        ];
        let c = evaluate(&session(), &fs).unwrap();
        assert_eq!(c[0].id, "b");
        assert_eq!(c[0].values[2], 41.);
        assert!(run(&"1+".repeat(3000)).is_err());
    }
    #[test]
    fn composite_units_survive_derived_references() {
        let u = Unit::parse("m/s")
            .product(&Unit::parse("mph"), true)
            .unwrap();
        let restored = Unit::parse(&u.label);
        assert_eq!(restored.dims, u.dims);
        assert_eq!(restored.scale, u.scale);
        let fs = vec![
            Formula {
                id: "a".into(),
                name: "A".into(),
                expression: "derivative([rpm])".into(),
            },
            Formula {
                id: "b".into(),
                name: "B".into(),
                expression: "[a]+1{rpm/s}".into(),
            },
        ];
        assert_eq!(evaluate(&session(), &fs).unwrap()[1].values[2], 11.);
    }
    #[test]
    fn invalid_samples_and_cross_channel_gaps_remain_unavailable() {
        let mut s = session();
        s.channels[0].values[2] = f64::NAN;
        s.channels.push(Channel {
            id: "clock".into(),
            name: "Clock".into(),
            unit: "rpm".into(),
            times: vec![0.5, 1.5, 2.5, 10., 20.5],
            values: vec![1.; 5],
            gaps: vec![],
        });
        let c = evaluate(
            &s,
            &[Formula {
                id: "d".into(),
                name: "D".into(),
                expression: "[rpm]+[clock]".into(),
            }],
        )
        .unwrap()
        .remove(0);
        for t in [1.5, 2., 2.5, 10.] {
            let i = c.times.iter().position(|v| *v == t).unwrap();
            assert!(c.values[i].is_nan());
        }
        assert!(!c.gaps.is_empty());
    }
    #[test]
    fn scaled_dimensionless_values_are_canonical_inline_and_in_dependencies() {
        for (expression, expected, unit) in [
            ("1{m}*(1{mph}/1{m/s})", 0.44704, "m"),
            ("sqrt(1{mph}/1{m/s})", 0.44704_f64.sqrt(), ""),
            ("sin(1{mph}/1{m/s})", 0.44704_f64.sin(), ""),
            ("cos(1{mph}/1{m/s})", 0.44704_f64.cos(), ""),
            ("log(1{mph}/1{m/s})", 0.44704_f64.ln(), ""),
            ("exp(1{mph}/1{m/s})", 0.44704_f64.exp(), ""),
        ] {
            let fs = vec![
                Formula {
                    id: "a".into(),
                    name: "A".into(),
                    expression: expression.into(),
                },
                Formula {
                    id: "b".into(),
                    name: "B".into(),
                    expression: "[a]".into(),
                },
            ];
            let cs = evaluate(&session(), &fs).unwrap();
            for c in cs {
                assert!(
                    (c.values[0] - expected).abs() < 1e-12,
                    "{expression}: {}",
                    c.values[0]
                );
                assert_eq!(c.unit, unit);
            }
        }
        let cs = evaluate(
            &session(),
            &[
                Formula {
                    id: "a".into(),
                    name: "A".into(),
                    expression: "1{mph}/1{m/s}".into(),
                },
                Formula {
                    id: "b".into(),
                    name: "B".into(),
                    expression: "1{m}*[a]".into(),
                },
            ],
        )
        .unwrap();
        assert!((cs[1].values[0] - 0.44704).abs() < 1e-12);
    }
    #[test]
    fn gear_sampling_holds_supported_states_without_bridging() {
        let mut s = session();
        s.channels[0].id = "gear".into();
        s.channels[0].name = "Calculated_Gear".into();
        s.channels[0].unit = "".into();
        s.channels[0].values = vec![2., 2., 3., 3., 4., 5., 5.];
        s.channels.push(Channel {
            id: "clock".into(),
            name: "Clock".into(),
            unit: "".into(),
            times: vec![1.5, 2.5, 10., 20.5],
            values: vec![0.; 4],
            gaps: vec![],
        });
        let c = evaluate(
            &s,
            &[Formula {
                id: "a".into(),
                name: "A".into(),
                expression: "[gear]+[clock]".into(),
            }],
        )
        .unwrap()
        .remove(0);
        for (t, v) in [(1.5, 2.), (2.5, 3.), (20.5, 5.)] {
            let i = c.times.iter().position(|x| *x == t).unwrap();
            assert_eq!(c.values[i], v);
        }
        assert!(c.values[c.times.iter().position(|x| *x == 10.).unwrap()].is_nan());
    }
    #[test]
    fn circular() {
        assert!(run("[d]+1").unwrap_err().contains("Circular"));
    }
}

fn split_unit(s: &str, op: char) -> Option<(&str, &str)> {
    let mut depth = 0i32;
    for (i, c) in s.char_indices().rev() {
        if c == ')' {
            depth += 1
        }
        if c == '(' {
            depth -= 1
        }
        if depth == 0 && c == op {
            return Some((&s[..i], &s[i + 1..]));
        }
    }
    None
}
#[derive(Clone, Debug, PartialEq)]
struct Unit {
    dims: [i16; 4],
    scale: f64,
    label: String,
    opaque: Option<String>,
}
impl Unit {
    fn parse(s: &str) -> Self {
        if s.starts_with('(') && s.ends_with(')') {
            let mut depth = 0i32;
            let mut outer = true;
            for (i, c) in s.char_indices() {
                if c == '(' {
                    depth += 1
                }
                if c == ')' {
                    depth -= 1;
                    if depth == 0 && i < s.len() - 1 {
                        outer = false;
                    }
                }
            }
            if outer {
                return Self::parse(&s[1..s.len() - 1]);
            }
        }
        if let Some(inner) = s.strip_prefix("sqrt(").and_then(|s| s.strip_suffix(')')) {
            let mut u = Self::parse(inner);
            if u.opaque.is_none() && u.dims.iter().all(|d| d % 2 == 0) {
                for d in &mut u.dims {
                    *d /= 2;
                }
                u.scale = u.scale.sqrt();
                u.label = s.into();
                return u;
            }
        }
        let (dims, scale, label) = match s.to_lowercase().as_str() {
            "" | "1" => ([0, 0, 0, 0], 1., ""),
            "m" => ([1, 0, 0, 0], 1., "m"),
            "s" | "sec" => ([0, 1, 0, 0], 1., "s"),
            "m/s" => ([1, -1, 0, 0], 1., "m/s"),
            "mph" => ([1, -1, 0, 0], 0.44704, "mph"),
            "km/h" | "kmh" | "kph" => ([1, -1, 0, 0], 1. / 3.6, "km/h"),
            "rpm" => ([0, 0, 1, 0], 1., "rpm"),
            "rpm/s" => ([0, -1, 1, 0], 1., "rpm/s"),
            "g" => ([1, -2, 0, 0], 9.80665, "G"),
            "m/s²" | "m/s^2" => ([1, -2, 0, 0], 1., "m/s^2"),
            _ => {
                if let Some((a, b)) = split_unit(s, '*') {
                    if let Ok(u) = Self::parse(a).product(&Self::parse(b), false) {
                        return u;
                    }
                }
                if let Some((a, b)) = split_unit(s, '/') {
                    if let Ok(u) = Self::parse(a).product(&Self::parse(b), true) {
                        return u;
                    }
                }
                return Self {
                    dims: [0; 4],
                    scale: 1.,
                    label: s.into(),
                    opaque: Some(s.into()),
                };
            }
        };
        Self {
            dims,
            scale,
            label: label.into(),
            opaque: None,
        }
    }
    fn compatible(&self, b: &Self) -> bool {
        self.dims == b.dims && self.opaque == b.opaque
    }
    fn dimensionless(&self) -> bool {
        self.dims == [0; 4] && self.opaque.is_none()
    }
    fn product(&self, b: &Self, divide: bool) -> Result<Self, String> {
        if self.opaque.is_some() || b.opaque.is_some() {
            if b.dimensionless() {
                return Ok(self.clone());
            }
            if self.dimensionless() && !divide {
                return Ok(b.clone());
            }
            return Err("Cannot combine unknown units; no conversion is assumed.".into());
        }
        let mut u = Self::parse("");
        for i in 0..4 {
            u.dims[i] = self.dims[i] + if divide { -b.dims[i] } else { b.dims[i] };
        }
        u.scale = if divide {
            self.scale / b.scale
        } else {
            self.scale * b.scale
        };
        u.label = if b.dimensionless() {
            self.label.clone()
        } else if self.dimensionless() && !divide {
            b.label.clone()
        } else {
            format!(
                "{}{}{}",
                if self.label.contains(['/', '*']) {
                    format!("({})", self.label)
                } else {
                    self.label.clone()
                },
                if divide { "/" } else { "*" },
                if b.label.contains(['/', '*']) {
                    format!("({})", b.label)
                } else {
                    b.label.clone()
                }
            )
        };
        Ok(u)
    }
}
#[derive(Clone, Debug, PartialEq)]
enum Token {
    Num(f64),
    Ref(String),
    Word(String),
    Str(String),
    Op(String),
    L,
    R,
    Comma,
    Unit(String),
}
fn lex(s: &str) -> Result<Vec<Token>, String> {
    let c: Vec<char> = s.chars().collect();
    let mut i = 0;
    let mut out = vec![];
    while i < c.len() {
        let x = c[i];
        if x.is_whitespace() {
            i += 1;
            continue;
        }
        let start = i;
        i += 1;
        out.push(match x {
            '(' => Token::L,
            ')' => Token::R,
            ',' => Token::Comma,
            '[' | '{' | '"' => {
                let end = match x {
                    '[' => ']',
                    '{' => '}',
                    _ => '"',
                };
                let begin = i;
                while i < c.len() && c[i] != end {
                    i += 1
                }
                if i == c.len() {
                    return Err(format!("Unclosed {x} at character {}", start + 1));
                }
                let v = c[begin..i].iter().collect();
                i += 1;
                match x {
                    '[' => Token::Ref(v),
                    '{' => Token::Unit(v),
                    _ => Token::Str(v),
                }
            }
            '0'..='9' | '.' => {
                while i < c.len() && (c[i].is_ascii_digit() || c[i] == '.') {
                    i += 1
                }
                if i < c.len() && matches!(c[i], 'e' | 'E') {
                    i += 1;
                    if i < c.len() && matches!(c[i], '+' | '-') {
                        i += 1
                    }
                    while i < c.len() && c[i].is_ascii_digit() {
                        i += 1
                    }
                }
                Token::Num(
                    c[start..i]
                        .iter()
                        .collect::<String>()
                        .parse()
                        .map_err(|_| "Invalid number")?,
                )
            }
            'a'..='z' | 'A'..='Z' | '_' => {
                while i < c.len() && (c[i].is_alphanumeric() || c[i] == '_') {
                    i += 1
                }
                Token::Word(c[start..i].iter().collect())
            }
            '+' | '-' | '*' | '/' | '<' | '>' | '=' | '!' => {
                if i < c.len() && c[i] == '=' {
                    i += 1
                }
                Token::Op(c[start..i].iter().collect())
            }
            _ => return Err(format!("Unsupported character '{x}'")),
        });
    }
    Ok(out)
}
#[derive(Clone)]
enum Ast {
    Constant(f64, Unit),
    Reference(String),
    Binary(String, Box<Ast>, Box<Ast>),
    Call(String, Vec<Ast>),
    Convert(Box<Ast>, Unit),
}
struct Parser {
    tokens: Vec<Token>,
    at: usize,
}
impl Parser {
    fn expr(&mut self, min: u8, depth: usize) -> Result<Ast, String> {
        if depth > 48 {
            return Err("Expression nesting exceeds 48 levels.".into());
        }
        let token = self
            .tokens
            .get(self.at)
            .cloned()
            .ok_or("Expected an expression")?;
        self.at += 1;
        let mut a = match token {
            Token::Num(n) => {
                if !n.is_finite() {
                    return Err("Constant must be finite".into());
                }
                let u = if let Some(Token::Unit(u)) = self.tokens.get(self.at) {
                    let u = Unit::parse(u);
                    self.at += 1;
                    u
                } else {
                    Unit::parse("")
                };
                Ast::Constant(n, u)
            }
            Token::Ref(id) => Ast::Reference(id),
            Token::Op(op) if op == "-" || op == "+" => {
                let a = self.expr(4, depth + 1)?;
                if op == "-" {
                    Ast::Binary(
                        "*".into(),
                        Box::new(Ast::Constant(-1., Unit::parse(""))),
                        Box::new(a),
                    )
                } else {
                    a
                }
            }
            Token::L => {
                let a = self.expr(0, depth + 1)?;
                self.expect(Token::R)?;
                a
            }
            Token::Word(name) => {
                self.expect(Token::L)?;
                let first = self.expr(0, depth + 1)?;
                if name == "convert" {
                    self.expect(Token::Comma)?;
                    let Some(Token::Str(u)) = self.tokens.get(self.at).cloned() else {
                        return Err("convert expects a quoted target unit".into());
                    };
                    self.at += 1;
                    self.expect(Token::R)?;
                    Ast::Convert(Box::new(first), Unit::parse(&u))
                } else {
                    let mut args = vec![first];
                    while self.tokens.get(self.at) == Some(&Token::Comma) {
                        self.at += 1;
                        args.push(self.expr(0, depth + 1)?)
                    }
                    self.expect(Token::R)?;
                    Ast::Call(name, args)
                }
            }
            _ => return Err("Expected a number, channel reference or function".into()),
        };
        while let Some(Token::Op(op)) = self.tokens.get(self.at) {
            let p = match op.as_str() {
                "==" | "!=" | "<" | ">" | "<=" | ">=" => 1,
                "+" | "-" => 2,
                "*" | "/" => 3,
                _ => return Err("Unsupported operator".into()),
            };
            if p < min {
                break;
            }
            let op = op.clone();
            self.at += 1;
            let b = self.expr(p + 1, depth + 1)?;
            a = Ast::Binary(op, Box::new(a), Box::new(b));
        }
        Ok(a)
    }
    fn expect(&mut self, t: Token) -> Result<(), String> {
        if self.tokens.get(self.at) == Some(&t) {
            self.at += 1;
            Ok(())
        } else {
            Err(format!("Expected {t:?} near token {}", self.at + 1))
        }
    }
}
#[derive(Clone)]
struct Data {
    unit: Unit,
    values: Vec<f64>,
}
fn sample(c: &Channel, t: f64, gaps: &[[f64; 2]]) -> f64 {
    if gaps.iter().any(|g| t > g[0] && t < g[1]) {
        return f64::NAN;
    }
    let i = c.times.partition_point(|v| *v < t);
    if i < c.times.len() && c.times[i] == t {
        return c.values.get(i).copied().unwrap_or(f64::NAN);
    }
    if i == 0 || i >= c.times.len() || gaps.iter().any(|g| t > g[0] && t < g[1]) {
        return f64::NAN;
    }
    let a = c.values[i - 1];
    let b = c.values[i];
    if !a.is_finite() || !b.is_finite() {
        return f64::NAN;
    }
    // Gear is a recorded state, held only inside a supported source interval.
    if c.name.to_lowercase().contains("gear") {
        return a;
    }
    a + (b - a) * (t - c.times[i - 1]) / (c.times[i] - c.times[i - 1])
}
fn refs(a: &Ast, out: &mut Vec<String>) {
    match a {
        Ast::Reference(id) => {
            if !out.contains(id) {
                out.push(id.clone())
            }
        }
        Ast::Binary(_, a, b) => {
            refs(a, out);
            refs(b, out)
        }
        Ast::Call(_, a) => {
            for a in a {
                refs(a, out)
            }
        }
        Ast::Convert(a, _) => refs(a, out),
        _ => (),
    }
}
// Every dimensionless subtree uses canonical values. This invariant keeps scalar
// products and nonlinear functions correct even when speed-unit ratios carry scale.
fn calc(a: &Ast, times: &[f64], channels: &[Channel], gaps: &[[f64; 2]]) -> Result<Data, String> {
    let mut data = calc_inner(a, times, channels, gaps)?;
    if data.unit.dimensionless() {
        for value in &mut data.values {
            *value *= data.unit.scale;
        }
        data.unit = Unit::parse("");
    }
    Ok(data)
}
fn calc_inner(
    a: &Ast,
    times: &[f64],
    channels: &[Channel],
    gaps: &[[f64; 2]],
) -> Result<Data, String> {
    let constant = |n, u| Data {
        unit: u,
        values: vec![n; times.len()],
    };
    match a {
        Ast::Constant(n, u) => Ok(constant(*n, u.clone())),
        Ast::Reference(id) => {
            let c = channels
                .iter()
                .find(|c| c.id == *id)
                .ok_or_else(|| format!("Channel [{id}] is missing from this session."))?;
            let gaps = super::source_gaps(c);
            Ok(Data {
                unit: Unit::parse(&c.unit),
                values: times.iter().map(|t| sample(c, *t, &gaps)).collect(),
            })
        }
        Ast::Convert(a, u) => {
            let mut a = calc(a, times, channels, gaps)?;
            if !a.unit.compatible(u) {
                return Err(format!("Cannot convert {} to {}", a.unit.label, u.label));
            }
            for v in &mut a.values {
                *v *= a.unit.scale / u.scale
            }
            a.unit = u.clone();
            Ok(a)
        }
        Ast::Binary(op, a, b) => {
            let a = calc(a, times, channels, gaps)?;
            let b = calc(b, times, channels, gaps)?;
            let compatible = !matches!(op.as_str(), "*" | "/");
            if compatible && !a.unit.compatible(&b.unit) {
                return Err(format!(
                    "Incompatible units '{}' and '{}'",
                    a.unit.label, b.unit.label
                ));
            }
            let comparison = matches!(op.as_str(), "<" | ">" | "<=" | ">=" | "==" | "!=");
            let unit = if comparison {
                Unit::parse("")
            } else if compatible {
                a.unit.clone()
            } else {
                a.unit.product(&b.unit, op == "/")?
            };
            let factor = b.unit.scale / a.unit.scale;
            let values = a
                .values
                .iter()
                .zip(b.values)
                .map(|(&a, b)| {
                    if !a.is_finite() || !b.is_finite() {
                        return f64::NAN;
                    }
                    let b = if compatible { b * factor } else { b };
                    match op.as_str() {
                        "+" => a + b,
                        "-" => a - b,
                        "*" => a * b,
                        "/" => a / b,
                        "<" => f64::from(a < b),
                        ">" => f64::from(a > b),
                        "<=" => f64::from(a <= b),
                        ">=" => f64::from(a >= b),
                        "==" => f64::from(a == b),
                        "!=" => f64::from(a != b),
                        _ => f64::NAN,
                    }
                })
                .collect();
            Ok(Data { unit, values })
        }
        Ast::Call(name, args) => {
            let arity = match name.as_str() {
                "min" | "max" => 2,
                "clamp" => 3,
                "abs" | "sqrt" | "sin" | "cos" | "tan" | "log" | "exp" | "derivative" => 1,
                _ => return Err(format!("Unknown function '{name}'")),
            };
            if args.len() != arity {
                return Err(format!("{name} expects {arity} argument(s)"));
            }
            let data: Vec<Data> = args
                .iter()
                .map(|a| calc(a, times, channels, gaps))
                .collect::<Result<_, _>>()?;
            let mut unit = data[0].unit.clone();
            if matches!(name.as_str(), "sin" | "cos" | "tan" | "log" | "exp")
                && !unit.dimensionless()
            {
                return Err(format!("{name} requires dimensionless input"));
            }
            if name == "sqrt" {
                if unit.opaque.is_some() || unit.dims.iter().any(|d| d % 2 != 0) {
                    return Err("sqrt requires even unit dimensions".into());
                }
                for d in &mut unit.dims {
                    *d /= 2
                }
                unit.scale = unit.scale.sqrt();
                unit.label = if unit.dimensionless() {
                    String::new()
                } else {
                    format!("sqrt({})", unit.label)
                }
            }
            if name == "derivative" {
                unit = unit.product(&Unit::parse("s"), true)?
            }
            for b in data.iter().skip(1) {
                if !data[0].unit.compatible(&b.unit) {
                    return Err(format!("{name} requires compatible units"));
                }
            }
            let values = (0..times.len())
                .map(|i| {
                    let v = data[0].values[i];
                    if !v.is_finite() {
                        return f64::NAN;
                    }
                    let b = data
                        .get(1)
                        .map(|b| b.values[i] * b.unit.scale / data[0].unit.scale)
                        .unwrap_or(0.);
                    let c = data
                        .get(2)
                        .map(|b| b.values[i] * b.unit.scale / data[0].unit.scale)
                        .unwrap_or(0.);
                    if data.iter().any(|d| !d.values[i].is_finite()) {
                        return f64::NAN;
                    }
                    match name.as_str() {
                        "abs" => v.abs(),
                        "sqrt" => v.sqrt(),
                        "sin" => v.sin(),
                        "cos" => v.cos(),
                        "tan" => v.tan(),
                        "log" => v.ln(),
                        "exp" => v.exp(),
                        "min" => v.min(b),
                        "max" => v.max(b),
                        "clamp" => {
                            if b <= c {
                                v.clamp(b, c)
                            } else {
                                f64::NAN
                            }
                        }
                        "derivative" => {
                            if i == 0 || gaps.iter().any(|g| g[0] < times[i] && g[1] > times[i - 1])
                            {
                                f64::NAN
                            } else {
                                (v - data[0].values[i - 1]) / (times[i] - times[i - 1])
                            }
                        }
                        _ => f64::NAN,
                    }
                })
                .collect();
            Ok(Data { unit, values })
        }
    }
}

pub fn evaluate(session: &Session, formulas: &[Formula]) -> Result<Vec<Channel>, String> {
    if formulas.len() > 64 {
        return Err("At most 64 formulas are supported.".into());
    }
    let mut parsed = vec![];
    let mut ids = std::collections::HashSet::new();
    for f in formulas {
        if f.id.is_empty() || f.id.len() > 128 || f.name.trim().is_empty() || f.name.len() > 256 {
            return Err("Formula needs a bounded, nonempty ID and name.".into());
        }
        if session.channels.iter().any(|c| c.id == f.id) || !ids.insert(f.id.clone()) {
            return Err(format!("Duplicate channel ID '{}'", f.id));
        }
        if f.expression.len() > 4096 {
            return Err("Expression exceeds 4096 characters.".into());
        }
        let tokens = lex(&f.expression)?;
        if tokens.len() > 512 {
            return Err("Expression exceeds 512 tokens.".into());
        }
        let mut p = Parser { tokens, at: 0 };
        let a = p.expr(0, 0).map_err(|e| format!("{}: {e}", f.name))?;
        if p.at != p.tokens.len() {
            return Err(format!("{}: unexpected trailing input", f.name));
        }
        parsed.push(a);
    }
    let mut channels = session.channels.clone();
    let mut state = vec![0u8; formulas.len()];
    let mut result = vec![None; formulas.len()];
    fn visit(
        i: usize,
        fs: &[Formula],
        asts: &[Ast],
        state: &mut [u8],
        channels: &mut Vec<Channel>,
        result: &mut [Option<Channel>],
    ) -> Result<(), String> {
        if state[i] == 2 {
            return Ok(());
        }
        if state[i] == 1 {
            return Err(format!(
                "Circular formula dependency involving '{}'",
                fs[i].name
            ));
        }
        state[i] = 1;
        let mut dependencies = vec![];
        refs(&asts[i], &mut dependencies);
        for id in &dependencies {
            if let Some(j) = fs.iter().position(|f| f.id == *id) {
                visit(j, fs, asts, state, channels, result)?
            } else if !channels.iter().any(|c| c.id == *id) {
                return Err(format!(
                    "{}: Channel [{id}] is missing from this session.",
                    fs[i].name
                ));
            }
        }
        let mut times: Vec<f64> = if dependencies.is_empty() {
            channels
                .first()
                .map(|c| c.times.clone())
                .unwrap_or_default()
        } else {
            channels
                .iter()
                .filter(|c| dependencies.contains(&c.id))
                .flat_map(|c| c.times.iter().copied())
                .collect()
        };
        times.retain(|t| t.is_finite());
        times.sort_by(f64::total_cmp);
        times.dedup();
        let mut gaps: Vec<[f64; 2]> = channels
            .iter()
            .filter(|c| dependencies.contains(&c.id))
            .flat_map(super::source_gaps)
            .collect();
        let d =
            calc(&asts[i], &times, channels, &gaps).map_err(|e| format!("{}: {e}", fs[i].name))?;
        let values: Vec<f64> = d
            .values
            .into_iter()
            .map(|v| if v.is_finite() { v } else { f64::NAN })
            .collect();
        for (k, v) in values.iter().enumerate() {
            if !v.is_finite() {
                gaps.push([
                    times[k.saturating_sub(1)],
                    times[(k + 1).min(times.len() - 1)],
                ]);
            }
        }
        let c = Channel {
            id: fs[i].id.clone(),
            name: fs[i].name.clone(),
            unit: d.unit.label,
            times,
            values,
            gaps,
        };
        channels.push(c.clone());
        result[i] = Some(c);
        state[i] = 2;
        Ok(())
    }
    for i in 0..formulas.len() {
        visit(i, formulas, &parsed, &mut state, &mut channels, &mut result)?
    }
    Ok(result.into_iter().flatten().collect())
}
