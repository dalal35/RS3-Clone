#[path = "../tests/support/synthetic_xrk.rs"]
mod synthetic_xrk;
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = std::env::args_os()
        .nth(1)
        .ok_or("Expected an explicit fixture output directory")?;
    synthetic_xrk::write_pair(std::path::Path::new(&output))?;
    Ok(())
}
