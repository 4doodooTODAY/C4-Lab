-- Add 'ready_to_post' to the stage enum so it sits between client approval and delivered
alter type project_stage add value if not exists 'ready_to_post' after 'revisions';
