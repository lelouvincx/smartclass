alter table exercises add column minimum_access_tier text not null default 'standard'
  check (minimum_access_tier in ('guest', 'standard', 'vip'));
