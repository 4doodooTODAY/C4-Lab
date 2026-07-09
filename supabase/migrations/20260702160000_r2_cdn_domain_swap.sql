-- Swap throttled r2.dev host → CDN-cached files.c4clab.com across all stored
-- file URLs. Pure hostname replace (same key path), idempotent — re-running
-- changes nothing already swapped. Old r2.dev URLs still resolve, so there is
-- no downtime window.

update shoot_uploads
  set file_url = replace(file_url,
    'https://pub-ea5805b9ca82445cab188b963cb395b0.r2.dev/',
    'https://files.c4clab.com/')
  where file_url like '%pub-ea5805b9ca82445cab188b963cb395b0.r2.dev%';

update shoot_uploads
  set thumbnail_url = replace(thumbnail_url,
    'https://pub-ea5805b9ca82445cab188b963cb395b0.r2.dev/',
    'https://files.c4clab.com/')
  where thumbnail_url like '%pub-ea5805b9ca82445cab188b963cb395b0.r2.dev%';

update project_revisions
  set video_url = replace(video_url,
    'https://pub-ea5805b9ca82445cab188b963cb395b0.r2.dev/',
    'https://files.c4clab.com/')
  where video_url like '%pub-ea5805b9ca82445cab188b963cb395b0.r2.dev%';

-- photo_urls is text[] — rewrite each element, preserving order
update project_revisions
  set photo_urls = (
    select array_agg(
      replace(elem,
        'https://pub-ea5805b9ca82445cab188b963cb395b0.r2.dev/',
        'https://files.c4clab.com/')
      order by ord)
    from unnest(photo_urls) with ordinality as t(elem, ord)
  )
  where array_to_string(photo_urls, '||') like '%pub-ea5805b9ca82445cab188b963cb395b0.r2.dev%';

update project_revisions
  set preview_urls = replace(preview_urls::text,
    'https://pub-ea5805b9ca82445cab188b963cb395b0.r2.dev/',
    'https://files.c4clab.com/')::jsonb
  where preview_urls::text like '%pub-ea5805b9ca82445cab188b963cb395b0.r2.dev%';
