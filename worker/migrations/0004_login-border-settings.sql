INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
  ('login_border_effect_enabled', '0', datetime('now')),
  ('login_border_preset',         'default', datetime('now')),
  ('login_border_color_1',        '#0dc1fd', datetime('now')),
  ('login_border_color_2',        '#d915ef', datetime('now')),
  ('login_border_color_3',        '#ff3f2ecc', datetime('now')),
  ('login_border_color_back',     '#00000000', datetime('now')),
  ('login_border_intensity',      '0.20', datetime('now')),
  ('login_border_speed',          '1.00', datetime('now')),
  ('login_border_thickness',      '0.10', datetime('now')),
  ('login_border_bloom',          '0.25', datetime('now'));
