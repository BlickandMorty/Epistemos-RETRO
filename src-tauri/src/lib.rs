mod commands;
mod error;

use commands::{notes, chat, graph, search, vault, system};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            notes::create_page,
            notes::get_page,
            notes::list_pages,
            notes::delete_page,
            notes::load_body,
            notes::save_body,
            notes::get_blocks,
            chat::create_chat,
            chat::list_chats,
            chat::get_messages,
            chat::delete_chat,
            chat::submit_query,
            graph::get_graph,
            graph::rebuild_graph,
            graph::search_graph,
            search::search_pages,
            vault::get_vault_path,
            vault::set_vault_path,
            vault::import_vault,
            system::get_inference_config,
            system::set_inference_config,
            system::test_connection,
            system::get_app_info,
        ]);

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default(),
            "../src/lib/bindings.ts",
        )
        .expect("Failed to export typescript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
