export type VoiceCommand =
  | { type: 'list_jobs' }
  | { type: 'create_job'; name: string }
  | { type: 'select_job'; query: string }
  | { type: 'mark_job_status'; status: 'quoted' | 'in_progress' | 'complete' | 'on_hold' }
  | { type: 'search_entries'; query: string }
  | { type: 'show_entries' }
  | { type: 'set_job_stage'; stage: string }
  | { type: 'save_entry' }
  | { type: 'save_debrief'; transcript: string }


