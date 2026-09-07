alter table exercises
  add column allow_answer_pdf_download integer not null default 0
  check (allow_answer_pdf_download in (0, 1));
