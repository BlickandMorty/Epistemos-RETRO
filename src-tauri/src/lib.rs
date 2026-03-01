mod commands;
mod error;
mod state;

use commands::{notes, chat, folders, graph, physics, research, search, vault, system};
use state::AppState;
use storage::db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            notes::create_page,
            notes::get_page,
            notes::list_pages,
            notes::update_page,
            notes::delete_page,
            notes::load_body,
            notes::save_body,
            notes::get_blocks,
            chat::create_chat,
            chat::list_chats,
            chat::get_messages,
            chat::delete_chat,
            chat::submit_query,
            chat::run_soar_stone,
            graph::get_graph,
            graph::rebuild_graph,
            graph::search_graph,
            graph::extract_entities,
            graph::get_node_details,
            graph::summarize_node,
            graph::set_node_embedding,
            graph::semantic_neighbors,
            graph::semantic_similarity,
            folders::create_folder,
            folders::get_folder,
            folders::list_folders,
            folders::update_folder,
            folders::delete_folder,
            search::search_pages,
            search::rebuild_search_index,
            search::search_hybrid,
            vault::get_vault_path,
            vault::set_vault_path,
            vault::import_vault,
            vault::export_page,
            vault::export_all,
            vault::start_vault_watcher,
            vault::stop_vault_watcher,
            vault::is_vault_watching,
            system::get_inference_config,
            system::set_inference_config,
            system::test_connection,
            system::get_app_info,
            system::check_local_services,
            system::get_local_model_config,
            system::set_local_model_config,
            system::get_cost_summary,
            system::set_daily_budget,
            system::reset_cost_tracker,
            physics::start_physics,
            physics::stop_physics,
            physics::pin_node,
            physics::unpin_node,
            physics::move_node,
            physics::is_physics_running,
            physics::toggle_fps_mode,
            physics::fps_input,
            physics::get_physics_mode,
            research::start_research,
            research::advance_research,
            research::get_research_status,
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

            let app_data = app.path().app_data_dir()
                .expect("failed to resolve app data directory");
            std::fs::create_dir_all(&app_data)
                .expect("failed to create app data directory");
            let db_path = app_data.join("epistemos.db");

            let db = Database::open(&db_path)
                .expect("failed to open database");
            let state = AppState::new(db);

            // Pre-load graph store from DB for fast search
            if let Err(e) = state.reload_graph() {
                eprintln!("Warning: failed to pre-load graph: {e}");
            }

            app.manage(state.clone());

            // Background: probe local AI services (Foundry, Ollama) so triage
            // routing works immediately. 3s timeout per service, non-blocking.
            tokio::spawn(async move {
                if let Err(e) = system::probe_and_cache_services(&state).await {
                    eprintln!("[startup] failed to probe local services: {e}");
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
