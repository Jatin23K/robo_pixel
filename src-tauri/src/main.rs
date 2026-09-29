#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

#[cfg(windows)]
fn exit_if_hide_helper() {
    let executable = std::env::current_exe().ok();
    let is_hide_helper = executable
        .as_ref()
        .and_then(|path| path.file_stem())
        .and_then(|name| name.to_str())
        .map(|name| name.eq_ignore_ascii_case("robo_hide"))
        .unwrap_or(false);

    if !is_hide_helper {
        return;
    }

    let _ = std::process::Command::new("taskkill")
        .args(["/IM", "robo.exe", "/F"])
        .output();
    std::process::exit(0);
}

#[cfg(not(windows))]
fn exit_if_hide_helper() {}

#[cfg(windows)]
fn acquire_single_instance() -> Option<windows::Win32::Foundation::HANDLE> {
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
    use windows::Win32::System::Threading::CreateMutexW;

    let name: Vec<u16> = std::ffi::OsStr::new("Local\\ROBO.Desktop.Companion.SingleInstance")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mutex = unsafe { CreateMutexW(None, false, windows::core::PCWSTR(name.as_ptr())) }.ok()?;
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        return None;
    }
    Some(mutex)
}

#[cfg(not(windows))]
fn acquire_single_instance() -> Option<()> {
    Some(())
}

const STATE_SCHEMA_VERSION: u32 = 1;
const STATE_FILE_NAME: &str = "pet-state.v1.json";
const ACTIVITY_INBOX_FILE_NAME: &str = "activity-inbox.jsonl";
const ACTIVITY_INBOX_MAX_EVENTS: usize = 50;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredPetState {
    schema_version: u32,
    state: serde_json::Value,
}

fn state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?
        .join(STATE_FILE_NAME))
}

const PACKS_DIR_NAME: &str = "packs";

/// A community pet pack read from the user packs directory. The frontend
/// validates and assembles these; the backend only reads raw files.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalPetPack {
    dir: String,
    manifest: serde_json::Value,
    metadata: serde_json::Value,
    sprite_png: Vec<u8>,
}

fn packs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?
        .join(PACKS_DIR_NAME))
}

/// Reject asset names that could escape the pack directory. Pack manifests may
/// declare their spritesheet/metadata file names, so keep them to plain files.
fn safe_asset_name(value: Option<&str>, default: &str) -> Option<String> {
    let name = value.unwrap_or(default);
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return None;
    }
    Some(name.to_string())
}

fn read_external_pack(path: &Path) -> Option<ExternalPetPack> {
    let dir = path.file_name()?.to_str()?.to_string();

    let manifest_raw = fs::read_to_string(path.join("manifest.json")).ok()?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_raw).ok()?;

    let assets = manifest.get("assets");
    let metadata_name = safe_asset_name(
        assets
            .and_then(|a| a.get("metadata"))
            .and_then(|v| v.as_str()),
        "spritesheet.json",
    )?;
    let sprite_name = safe_asset_name(
        assets
            .and_then(|a| a.get("spritesheet"))
            .and_then(|v| v.as_str()),
        "spritesheet.png",
    )?;

    let metadata_raw = fs::read_to_string(path.join(&metadata_name)).ok()?;
    let metadata: serde_json::Value = serde_json::from_str(&metadata_raw).ok()?;
    let sprite_png = fs::read(path.join(&sprite_name)).ok()?;

    Some(ExternalPetPack {
        dir,
        manifest,
        metadata,
        sprite_png,
    })
}

#[tauri::command]
fn list_external_pet_packs(app: AppHandle) -> Result<Vec<ExternalPetPack>, String> {
    let dir = packs_dir(&app)?;
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("read packs dir: {error}")),
    };

    let mut packs = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(pack) = read_external_pack(&path) {
                packs.push(pack);
            }
        }
    }

    Ok(packs)
}

fn activity_inbox_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?
        .join(ACTIVITY_INBOX_FILE_NAME))
}

/// Read and clear the local activity inbox. A host (for example a Claude Code
/// hook) appends one JSON activity object per line to this file; the webview
/// drains it on a low-frequency poll. Best-effort and local-only: the file is
/// removed after reading, malformed lines are skipped, and only the most recent
/// events are returned so a runaway writer cannot flood the pet.
#[tauri::command]
fn drain_activity_inbox(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = activity_inbox_path(&app)?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("read activity inbox: {error}")),
    };

    // Remove first so events are processed at most once even if a later parse
    // step were to fail.
    let _ = fs::remove_file(&path);

    let mut events: Vec<serde_json::Value> = raw
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .collect();

    if events.len() > ACTIVITY_INBOX_MAX_EVENTS {
        events = events.split_off(events.len() - ACTIVITY_INBOX_MAX_EVENTS);
    }

    Ok(events)
}

#[tauri::command]
fn load_pet_state(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = state_file_path(&app)?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("read pet state: {error}")),
    };

    let stored = match serde_json::from_str::<StoredPetState>(&raw) {
        Ok(stored) => stored,
        Err(_) => return Ok(None),
    };

    if stored.schema_version != STATE_SCHEMA_VERSION {
        return Ok(None);
    }

    Ok(Some(stored.state))
}

#[tauri::command]
fn save_pet_state(app: AppHandle, state: serde_json::Value) -> Result<(), String> {
    let path = state_file_path(&app)?;
    let dir = path
        .parent()
        .ok_or_else(|| "resolve pet state parent directory".to_string())?;
    fs::create_dir_all(dir).map_err(|error| format!("create app data dir: {error}"))?;

    let stored = StoredPetState {
        schema_version: STATE_SCHEMA_VERSION,
        state,
    };
    let raw = serde_json::to_vec_pretty(&stored)
        .map_err(|error| format!("serialize pet state: {error}"))?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, raw).map_err(|error| format!("write temporary pet state: {error}"))?;
    fs::rename(&tmp_path, &path).map_err(|error| format!("replace pet state: {error}"))?;
    Ok(())
}

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
struct HitRect {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

struct HitZonesState {
    zones: std::sync::Mutex<Vec<HitRect>>,
}

#[tauri::command]
fn update_hit_zones(
    state: tauri::State<std::sync::Arc<HitZonesState>>,
    zones: Vec<HitRect>,
) -> Result<(), String> {
    if let Ok(mut lock) = state.zones.lock() {
        *lock = zones;
    }
    Ok(())
}

#[tauri::command]
fn get_window_pos(window: tauri::Window) -> Result<(i32, i32), String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    Ok((pos.x, pos.y))
}

#[tauri::command]
fn get_window_screen_info(window: tauri::Window, current_is_right: Option<bool>) -> Result<serde_json::Value, String> {
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let monitor = window.current_monitor().map_err(|e| e.to_string())?;
    let (mon_x, mon_w) = if let Some(m) = monitor {
        (m.position().x, m.size().width)
    } else {
        (0, 1920)
    };
    let robo_canvas_x = if current_is_right.unwrap_or(true) { 324.0 } else { 119.0 };
    let robo_screen_x = pos.x + ((robo_canvas_x * scale) as i32);
    let mon_center_x = mon_x + (mon_w as i32 / 2);
    let is_right_half = robo_screen_x > mon_center_x;

    Ok(serde_json::json!({
        "is_right_half": is_right_half,
        "x": (pos.x as f64 / scale).round() as i32,
        "y": (pos.y as f64 / scale).round() as i32,
        "scale": scale
    }))
}

#[tauri::command]
fn set_window_pos(window: tauri::Window, x: i32, y: i32) -> Result<(), String> {
    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())
}

static IS_DRAGGING_WINDOW: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
fn start_mouse_drag(app: AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        if let Some(window) = app.get_webview_window("main") {
            let (start_win_x, start_win_y) = if let Ok(pos) = window.outer_position() {
                (pos.x, pos.y)
            } else {
                return Ok(());
            };

            std::thread::spawn(move || {
                use windows::Win32::Foundation::{HWND, POINT};
                use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
                use windows::Win32::UI::WindowsAndMessaging::{
                    GetCursorPos, SetWindowPos, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOSIZE,
                    SWP_NOZORDER,
                };

                #[link(name = "winmm")]
                extern "system" {
                    fn timeBeginPeriod(uPeriod: u32) -> u32;
                    fn timeEndPeriod(uPeriod: u32) -> u32;
                }

                unsafe {
                    let _ = timeBeginPeriod(1);
                }
                IS_DRAGGING_WINDOW.store(true, std::sync::atomic::Ordering::SeqCst);

                let mut start_pt = POINT { x: 0, y: 0 };
                let ok = unsafe { GetCursorPos(&mut start_pt).is_ok() };
                if !ok {
                    unsafe { timeEndPeriod(1); }
                    IS_DRAGGING_WINDOW.store(false, std::sync::atomic::Ordering::SeqCst);
                    return;
                }

                let hwnd = match window.hwnd() {
                    Ok(h) => HWND(h.0),
                    Err(_) => {
                        unsafe { timeEndPeriod(1); }
                        IS_DRAGGING_WINDOW.store(false, std::sync::atomic::Ordering::SeqCst);
                        return;
                    }
                };

                let mut last_target_x = start_win_x;
                let mut last_target_y = start_win_y;
                let mut has_started_drag = false;

                while (unsafe { GetAsyncKeyState(VK_LBUTTON.0 as i32) } as u16 & 0x8000) != 0 {
                    let mut cur_pt = POINT { x: 0, y: 0 };
                    unsafe {
                        if GetCursorPos(&mut cur_pt).is_ok() {
                            let delta_x = cur_pt.x - start_pt.x;
                            let delta_y = cur_pt.y - start_pt.y;
                            let dist_sq = delta_x * delta_x + delta_y * delta_y;
                            if !has_started_drag && dist_sq >= 25 {
                                has_started_drag = true;
                            }

                            if has_started_drag {
                                let target_x = start_win_x + delta_x;
                                let target_y = start_win_y + delta_y;

                                if target_x != last_target_x || target_y != last_target_y {
                                    let _ = SetWindowPos(
                                        hwnd,
                                        None,
                                        target_x,
                                        target_y,
                                        0,
                                        0,
                                        SWP_NOSIZE
                                            | SWP_NOZORDER
                                            | SWP_NOACTIVATE
                                            | SWP_ASYNCWINDOWPOS,
                                    );
                                    last_target_x = target_x;
                                    last_target_y = target_y;
                                }
                            }
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(1));
                }

                unsafe {
                    timeEndPeriod(1);
                }
                IS_DRAGGING_WINDOW.store(false, std::sync::atomic::Ordering::SeqCst);
            });
        }
    }
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

use tauri::Emitter;

#[derive(Clone, serde::Serialize)]
struct OsContext {
    active_window_title: String,
    active_process_name: String,
    idle_time_ms: u32,
}

#[cfg(windows)]
fn track_os_context(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId};
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ};
        use windows::Win32::System::ProcessStatus::GetModuleFileNameExW;
        use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        use windows::Win32::System::SystemInformation::GetTickCount;
        
        loop {
            unsafe {
                let mut last_input = LASTINPUTINFO {
                    cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
                    dwTime: 0,
                };
                let idle_time_ms = if GetLastInputInfo(&mut last_input).as_bool() {
                    GetTickCount().wrapping_sub(last_input.dwTime)
                } else {
                    0
                };

                let hwnd = GetForegroundWindow();
                let mut title = String::new();
                let mut process_name = String::new();

                if !hwnd.is_invalid() {
                    let mut buf = [0u16; 512];
                    let len = GetWindowTextW(hwnd, &mut buf);
                    if len > 0 {
                        title = String::from_utf16_lossy(&buf[..len as usize]);
                    }

                    let mut pid = 0;
                    GetWindowThreadProcessId(hwnd, Some(&mut pid));
                    
                    if let Ok(process_handle) = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, false, pid) {
                        let mut name_buf = [0u16; 1024];
                        let name_len = GetModuleFileNameExW(process_handle, None, &mut name_buf);
                        if name_len > 0 {
                            let full_path = String::from_utf16_lossy(&name_buf[..name_len as usize]);
                            if let Some(name) = std::path::Path::new(&full_path).file_name() {
                                process_name = name.to_string_lossy().into_owned();
                            }
                        }
                    }
                }

                let context = OsContext {
                    active_window_title: title,
                    active_process_name: process_name,
                    idle_time_ms,
                };

                let _ = app.emit("os-context", context);
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });
}

#[cfg(not(windows))]
fn track_os_context(_app: tauri::AppHandle) {}

fn main() {
    exit_if_hide_helper();
    let _single_instance = match acquire_single_instance() {
        Some(mutex) => mutex,
        None => return,
    };

    tauri::Builder::default()
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Pixel Pet")
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            load_pet_state,
            save_pet_state,
            list_external_pet_packs,
            drain_activity_inbox,
            get_window_pos,
            get_window_screen_info,
            set_window_pos,
            start_mouse_drag,
            update_hit_zones
        ])
        .setup(|app| {
            track_os_context(app.handle().clone());

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(440.0, 240.0)));
                let _ = window.show();
                let _ = window.set_focus();
            }

            let hit_zones = std::sync::Arc::new(HitZonesState {
                zones: std::sync::Mutex::new(vec![HitRect {
                    x: 260,
                    y: 10,
                    width: 125,
                    height: 220,
                }]),
            });
            app.manage(hit_zones.clone());

            #[cfg(windows)]
            {
                let app_handle = app.handle().clone();
                let hit_zones_thread = hit_zones.clone();
                std::thread::spawn(move || {
                    use windows::Win32::Foundation::POINT;
                    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
                    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;
                    let mut is_ignoring = false;
                    let mut mouse_was_down_on_robo = false;
                    loop {
                        std::thread::sleep(std::time::Duration::from_millis(16));
                        if IS_DRAGGING_WINDOW.load(std::sync::atomic::Ordering::SeqCst) {
                            continue;
                        }
                        if let Some(window) = app_handle.get_webview_window("main") {
                            if let Ok(true) = window.is_visible() {
                                let mut pt = POINT { x: 0, y: 0 };
                                unsafe {
                                    if GetCursorPos(&mut pt).is_ok() {
                                        if let Ok(pos) = window.outer_position() {
                                            let scale = window.scale_factor().unwrap_or(1.0);
                                            let client_x = pt.x - pos.x;
                                            let client_y = pt.y - pos.y;
                                            let css_x = (client_x as f64 / scale).round() as i32;
                                            let css_y = (client_y as f64 / scale).round() as i32;

                                            let is_lbutton_down = (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0;

                                            let mut inside_any = false;
                                            if let Ok(lock) = hit_zones_thread.zones.lock() {
                                                for z in lock.iter() {
                                                    if css_x >= (z.x - 6)
                                                        && css_x <= (z.x + z.width + 6)
                                                        && css_y >= (z.y - 6)
                                                        && css_y <= (z.y + z.height + 6)
                                                    {
                                                        inside_any = true;
                                                        break;
                                                    }
                                                }
                                            }

                                            if is_lbutton_down {
                                                if !is_ignoring {
                                                    mouse_was_down_on_robo = true;
                                                }
                                            } else {
                                                mouse_was_down_on_robo = false;
                                            }

                                            let should_be_interactive = inside_any || mouse_was_down_on_robo;

                                            if should_be_interactive && is_ignoring {
                                                let _ = window.set_ignore_cursor_events(false);
                                                is_ignoring = false;
                                            } else if !should_be_interactive && !is_ignoring {
                                                let _ = window.set_ignore_cursor_events(true);
                                                is_ignoring = true;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }

            let show_i = MenuItem::with_id(app, "show", "Show Pixel Pet", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Pixel Pet")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "hide" => hide_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            app.manage(tray);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running pixel-pet");
}
