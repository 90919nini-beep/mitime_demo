-- email_set_automation_mode already writes its own explicit audit_log
-- entry (mode changes are the sensitive AUTO_SEND transition and deserve
-- a dedicated before/after shape), but email_update_automation's plain
-- field edits (name/description/template/is_active) had no coverage at
-- all -- unlike email_templates/email_template_versions/email_campaigns,
-- which all got this same generic trigger when they were created. Closing
-- that gap with the identical pattern.
CREATE TRIGGER email_automations_audit
AFTER UPDATE ON public.email_automations
FOR EACH ROW EXECUTE FUNCTION audit_log_change('id');
