# Migration history

Schema and RLS for this project were, until 2026-08-18, managed only through
the live Supabase project (dashboard/MCP) and were never captured in git —
`list_migrations` on the live project shows real history going back to
2026-04-13 (`add_location_columns_to_parties`, `create_cloud_data_table`,
`add_party_icon_columns`, `add_party_signups_push_token`) that has no
corresponding file here, because its exact original SQL isn't retrievable
through the tooling available when this directory was created, and
reconstructing it from the current live schema would risk silently
misrepresenting history that was never actually reviewed as a diff.

Starting with `20260818223454_parties_close_unrestricted_anon_write_access.sql`,
every migration applied to this project is captured here, matching the exact
SQL that was actually run (confirmed against `list_migrations` on the live
project). Apply new changes via `apply_migration` (or the Supabase CLI) and
add the corresponding file here in the same change, so this directory stays
a true record going forward.

One deliberate omission: the one-time admin-owner bootstrap (`insert into
user_roles ... values (<uid>, 'owner', ...)`) is **not** a migration file —
it's environment-specific data (a real person's account id), not schema, and
keeping it out of git avoids publishing who holds the owner role in this
project's history. See the Admin Dashboard plan (`§8 Authentication &
Authorization Architecture`) for how it was run.
