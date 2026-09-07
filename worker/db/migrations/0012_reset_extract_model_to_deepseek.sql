-- DeepSeek is now the sole extraction provider. Existing provider-specific
-- selections fall back to the server default rather than remaining stale.
update exercises
set extract_model = null
where extract_model is not null
  and extract_model <> 'deepseek-v4-flash-vision-exp';
