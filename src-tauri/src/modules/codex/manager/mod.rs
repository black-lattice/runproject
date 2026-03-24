pub mod actions;
pub mod commands;
pub mod discovery;
pub mod mcp;
pub mod tools;
pub mod utils;

use super::session::CodexSession;
use lazy_static::lazy_static;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

lazy_static! {
    pub(crate) static ref SESSIONS: Arc<Mutex<HashMap<String, CodexSession>>> =
        Arc::new(Mutex::new(HashMap::new()));
}

pub use commands::*;
