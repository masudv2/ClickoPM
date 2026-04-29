-- Add start_date and target_date to project for roadmap timeline
ALTER TABLE project ADD COLUMN start_date DATE;
ALTER TABLE project ADD COLUMN target_date DATE;
