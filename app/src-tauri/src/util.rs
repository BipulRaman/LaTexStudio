//! Cross-cutting helpers.

use std::ffi::OsStr;
use std::process::Command;

/// Builds a `std::process::Command` that doesn't spawn a console window on
/// Windows (avoids the flashing terminal when invoking CLI children from a
/// GUI process). No-op on other platforms.
pub fn quiet_command<S: AsRef<OsStr>>(program: S) -> Command {
    let mut cmd = Command::new(program);
    apply_no_window(&mut cmd);
    cmd
}

#[inline]
pub fn apply_no_window(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}

#[cfg(windows)]
#[inline]
pub fn apply_no_window_async(cmd: &mut tokio::process::Command) {
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
#[inline]
pub fn apply_no_window_async(_cmd: &mut tokio::process::Command) {}
