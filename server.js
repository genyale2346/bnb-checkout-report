<?php
/**
 * Plugin Name: HK Planner (CiaoBooking) — Minimal
 * Description: Planner housekeeping minimal per staff: selezione data, lista camere con CHECK-OUT, colonna DA FARE (rosso->verde). Evidenzia ospiti extra (cerchio rosso) solo quando NON c'è check-out e gli ospiti superano il default.
 * Version: 1.0.3
 * Author: Gennaro
 */

if (!defined('ABSPATH')) exit;

class HK_Planner_CiaoBooking_Minimal {
    const OPT_KEY = 'hk_planner_cb_min_settings';
    const TOKEN_TRANSIENT = 'hk_planner_cb_min_token';

    // CiaoBooking
    const API_BASE_DEFAULT = 'https://api.ciaobooking.com';
    const LOGIN_ENDPOINT = '/api/public/login';
    const RES_ENDPOINT   = '/api/public/reservations';

    // Regole ospiti
    const SPECIAL_PROPERTY_ID_TNS = 142889; // Tutta Nata Storia
    const DEFAULT_PREP_OTHER = 2;
    const DEFAULT_PREP_TNS   = 3;
    const THRESHOLD_OTHER = 2;
    const THRESHOLD_TNS   = 3;

    // **Chiave API per Google Sheets**
    const GOOGLE_SHEETS_API_KEY = 'AlzaSyB50UoXqgFbPv8k1VLwHVTnDMLY7BtSNw'; // Aggiungi qui la tua chiave API

    public static function init() {
        add_action('admin_menu', [__CLASS__, 'admin_menu']);
        add_action('admin_init', [__CLASS__, 'register_settings']);

        add_shortcode('hk_planner', [__CLASS__, 'shortcode']);

        add_action('template_redirect', [__CLASS__, 'maybe_disable_cache_headers']);

        add_action('admin_post_hk_planner_toggle_done', [__CLASS__, 'handle_toggle_done']);
        add_action('admin_post_hk_planner_toggle_tt', [__CLASS__, 'handle_toggle_tt']);
        add_action('admin_post_nopriv_hk_planner_toggle_done', [__CLASS__, 'handle_toggle_done']);
        add_action('admin_post_nopriv_hk_planner_toggle_tt', [__CLASS__, 'handle_toggle_tt']);
    }

    public static function register_settings() {
        register_setting(self::OPT_KEY, self::OPT_KEY, [__CLASS__, 'sanitize_settings']);
    }

    public static function sanitize_settings($in) {
        $out = [];
        $out['api_base_url'] = isset($in['api_base_url']) ? esc_url_raw(trim($in['api_base_url'])) : self::API_BASE_DEFAULT;
        if ($out['api_base_url'] === '') $out['api_base_url'] = self::API_BASE_DEFAULT;

        $out['email'] = isset($in['email']) ? sanitize_email($in['email']) : '';
        $out['password'] = isset($in['password']) ? (string)$in['password'] : '';
        $out['source'] = isset($in['source']) ? sanitize_text_field($in['source']) : 'wp';
        $out['locale'] = isset($in['locale']) ? sanitize_text_field($in['locale']) : 'it';

        $out['property_id_tns'] = isset($in['property_id_tns']) ? intval($in['property_id_tns']) : self::SPECIAL_PROPERTY_ID_TNS;
        if ($out['property_id_tns'] <= 0) $out['property_id_tns'] = self::SPECIAL_PROPERTY_ID_TNS;

        $out['exclude_rooms'] = isset($in['exclude_rooms']) ? sanitize_text_field($in['exclude_rooms']) : '';

        $out['cache_minutes'] = isset($in['cache_minutes']) ? intval($in['cache_minutes']) : 2;
        if ($out['cache_minutes'] < 0) $out['cache_minutes'] = 0;
        if ($out['cache_minutes'] > 60) $out['cache_minutes'] = 60;

        
        $out['slack_enabled'] = !empty($in['slack_enabled']) ? 1 : 0;
        $out['slack_webhook_url'] = isset($in['slack_webhook_url']) ? esc_url_raw(trim($in['slack_webhook_url'])) : '';
        // accetta solo https
        if ($out['slack_webhook_url'] !== '' && stripos($out['slack_webhook_url'], 'https://') !== 0) {
            $out['slack_webhook_url'] = '';
        }
        return $out;
    }

    private static function get_settings() {
        $s = get_option(self::OPT_KEY);
        if (!is_array($s)) $s = [];

        $s = wp_parse_args($s, [
            'api_base_url' => self::API_BASE_DEFAULT,
            'email' => '',
            'password' => '',
            'source' => 'wp',
            'locale' => 'it',
            'property_id_tns' => self::SPECIAL_PROPERTY_ID_TNS,
            'exclude_rooms' => '',
            'cache_minutes' => 2,
            'slack_enabled' => 0,
            'slack_webhook_url' => '',
        ]);

        return $s;
    }

    public static function admin_menu() {
        add_options_page('HK Planner', 'HK Planner', 'manage_options', 'hk-planner', [__CLASS__, 'settings_page']);
    }

    public static function settings_page() {
        if (!current_user_can('manage_options')) return;
        $s = self::get_settings();
        $opt_name = self::OPT_KEY;
        ?>
        <div class="wrap">
            <h1>HK Planner (CiaoBooking) — Minimal</h1>
            <p><strong>Shortcode:</strong> <code>[hk_planner]</code></p>

            <form method="post" action="options.php">
                <?php settings_fields(self::OPT_KEY); ?>

                <h2>API</h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="hk_api_base">API Base URL</label></th>
                        <td><input class="regular-text" type="text" id="hk_api_base" name="<?php echo esc_attr($opt_name); ?>[api_base_url]" value="<?php echo esc_attr($s['api_base_url']); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hk_email">Email API</label></th>
                        <td><input class="regular-text" type="email" id="hk_email" name="<?php echo esc_attr($opt_name); ?>[email]" value="<?php echo esc_attr($s['email']); ?>" autocomplete="off" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hk_password">Password API</label></th>
                        <td><input class="regular-text" type="password" id="hk_password" name="<?php echo esc_attr($opt_name); ?>[password]" value="<?php echo esc_attr($s['password']); ?>" autocomplete="new-password" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hk_source">Source (login)</label></th>
                        <td><input class="regular-text" type="text" id="hk_source" name="<?php echo esc_attr($opt_name); ?>[source]" value="<?php echo esc_attr($s['source']); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hk_locale">Locale header</label></th>
                        <td><input class="small-text" type="text" id="hk_locale" name="<?php echo esc_attr($opt_name); ?>[locale]" value="<?php echo esc_attr($s['locale']); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hk_cache_minutes">Cache API (minuti)</label></th>
                        <td>
                            <input class="small-text" type="number" id="hk_cache_minutes" name="<?php echo esc_attr($opt_name); ?>[cache_minutes]" value="<?php echo esc_attr($s['cache_minutes']); ?>" min="0" max="60" />
                            <p class="description">Suggerito: 2-5 minuti. 0 = nessuna cache.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Notifiche Slack</th>
                        <td>
                            <label style="display:inline-flex;align-items:center;gap:8px;">
                                <input type="checkbox" name="<?php echo esc_attr(self::OPT_KEY); ?>[slack_enabled]" value="1" <?php checked(!empty($s['slack_enabled'])); ?> />
                                <span>Abilita notifiche su Slack (push su cellulare)</span>
                            </label>
                            <p class="description">Usa un <strong>Incoming Webhook</strong> Slack.</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">Slack Webhook URL</th>
                        <td>
                            <input type="text" class="regular-text" name="<?php echo esc_attr(self::OPT_KEY); ?>[slack_webhook_url]" value="<?php echo esc_attr($s['slack_webhook_url'] ?? ''); ?>" placeholder="https://hooks.slack.com/services/..." />
                            <p class="description">Incolla qui l’URL del webhook. Deve iniziare con <code>https://</code></p>
                        </td>
                    </tr>

                </table>

                <h2>Regole</h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="hk_property_tns">Property ID “Tutta Nata Storia”</label></th>
                        <td><input class="regular-text" type="number" id="hk_property_tns" name="<?php echo esc_attr($opt_name); ?>[property_id_tns]" value="<?php echo esc_attr($s['property_id_tns']); ?>" /></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="hk_exclude_rooms">Escludi camere (per nome)</label></th>
                        <td>
                            <input class="regular-text" type="text" id="hk_exclude_rooms" name="<?php echo esc_attr($opt_name); ?>[exclude_rooms]" value="<?php echo esc_attr($s['exclude_rooms']); ?>" />
                            <p class="description">Separati da virgola. Esempio: <code>Seregno, Camera X</code></p>
                        </td>
                    </tr>
                </table>

                <?php submit_button('Salva impostazioni'); ?>
            </form>
        </div>
        <?php
    }

    private static function table_name() {
        global $wpdb;
        return $wpdb->prefix . 'hk_planner_done';
    }

    private static function maybe_create_table() {
        global $wpdb;
        $table = self::table_name();
        $charset = $wpdb->get_charset_collate();

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $sql = "CREATE TABLE {$table} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            work_date DATE NOT NULL,
            key_type VARCHAR(10) NOT NULL,
            key_id BIGINT UNSIGNED NOT NULL,
            is_done TINYINT(1) NOT NULL DEFAULT 0,
            done_at DATETIME NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY work_key (work_date, key_type, key_id)
        ) {$charset};";

        dbDelta($sql);
    }

    private static function safe_date_or_today($date_str) {
        if (is_string($date_str) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date_str)) return $date_str;
        return current_time('Y-m-d');
    }

    private static function build_key($reservation_id, $unit_id) {
        $uid = intval($unit_id);
        if ($uid > 0) {
            return ['key_type' => 'unit', 'key_id' => $uid];
        }
        $rid = intval($reservation_id);
        if ($rid > 0) {
            return ['key_type' => 'res', 'key_id' => $rid];
        }
        return ['key_type' => 'unit', 'key_id' => 0];
    }

    private static function exclude_room($room_name) {
        $s = self::get_settings();
        $list = trim((string)($s['exclude_rooms'] ?? ''));
        if ($list === '') return false;

        $needle = mb_strtolower(trim((string)$room_name));
        if ($needle === '') return false;

        $parts = array_filter(array_map('trim', explode(',', $list)));
        foreach ($parts as $p) {
            if ($p === '') continue;
            if (mb_strtolower($p) === $needle) return true;
        }
        return false;
    }

    private static function get_done_map($work_date) {
        global $wpdb;
        $table = self::table_name();
        $work_date = sanitize_text_field($work_date);

        $rows = $wpdb->get_results(
            $wpdb->prepare("SELECT key_type, key_id, is_done FROM {$table} WHERE work_date=%s", $work_date),
            ARRAY_A
        );

        $map = [];
        if (is_array($rows)) {
            foreach ($rows as $r) {
                $kt = (string)($r['key_type'] ?? '');
                $kid = intval($r['key_id'] ?? 0);
                if ($kt && $kid > 0) {
                    $map[$kt . '_' . $kid] = intval($r['is_done'] ?? 0);
                }
            }
        }
        return $map;
    }

    
    private static function send_slack($text) {
        $s = self::get_settings();
        if (empty($s['slack_enabled']) || empty($s['slack_webhook_url'])) return;

        $payload = wp_json_encode(['text' => (string)$text], JSON_UNESCAPED_UNICODE);
        wp_remote_post((string)$s['slack_webhook_url'], [
            'timeout' => 8,
            'headers' => ['Content-Type' => 'application/json; charset=utf-8'],
            'body' => $payload,
        ]);
    }

public static function handle_toggle_tt() {
        // Toggle/check TT (no Slack). Works like DA FARE: POST -> redirect back.
        $return_url = isset($_POST['return_url']) ? esc_url_raw($_POST['return_url']) : home_url('/');
        $hk_date = isset($_POST['work_date']) ? sanitize_text_field($_POST['work_date']) : '';
        $reservation_id = isset($_POST['reservation_id']) ? sanitize_text_field($_POST['reservation_id']) : '';

        // Nonce
        $nonce_action = 'hk_planner_tt_' . $hk_date . '_' . $reservation_id;
        if (!isset($_POST['_wpnonce']) || !wp_verify_nonce($_POST['_wpnonce'], $nonce_action)) {
            wp_safe_redirect(add_query_arg('hkerr', 'bad_nonce', $return_url));
            exit;
        }

        if (!empty($hk_date) && !empty($reservation_id)) {
            if (self::tt_is_checked($reservation_id, $hk_date)) {
                self::tt_clear_checked($reservation_id, $hk_date);
                delete_option(self::tt_value_key($reservation_id, $hk_date));
            } else {
                self::tt_set_checked($reservation_id, $hk_date);
                $tt_value = isset($_POST['tt_value']) ? floatval($_POST['tt_value']) : null;
                if ($tt_value !== null) {
                    self::tt_set_value($reservation_id, $hk_date, $tt_value);
                }
            }
        }

        wp_safe_redirect(add_query_arg('saved', '1', $return_url));
        exit;
    }

    public static function handle_toggle_done() {
        self::maybe_create_table();

        $work_date = isset($_POST['work_date']) ? self::safe_date_or_today(wp_unslash($_POST['work_date'])) : current_time('Y-m-d');
        $return_url = isset($_POST['return_url']) ? wp_unslash($_POST['return_url']) : home_url('/');
        $return_url = wp_validate_redirect($return_url, home_url('/'));

        $key_type = isset($_POST['key_type']) ? sanitize_text_field(wp_unslash($_POST['key_type'])) : '';
        $key_id   = isset($_POST['key_id']) ? intval($_POST['key_id']) : 0;

        $label = isset($_POST['label']) ? sanitize_text_field(wp_unslash($_POST['label'])) : '';


        if (!in_array($key_type, ['res','unit'], true) || $key_id <= 0) {
            wp_safe_redirect(add_query_arg(['hk_date'=>$work_date,'hkerr'=>'badkey'], $return_url));
            exit;
        }

        $nonce_action = 'hk_planner_toggle_' . $work_date . '_' . $key_type . '_' . $key_id;
        if (!isset($_POST['_wpnonce']) || !wp_verify_nonce($_POST['_wpnonce'], $nonce_action)) {
            wp_safe_redirect(add_query_arg(['hk_date'=>$work_date,'hkerr'=>'nonce'], $return_url));
            exit;
        }

        global $wpdb;
        $table = self::table_name();

        $row = $wpdb->get_row(
            $wpdb->prepare("SELECT is_done FROM {$table} WHERE work_date=%s AND key_type=%s AND key_id=%d LIMIT 1", $work_date, $key_type, $key_id),
            ARRAY_A
        );

        $current = is_array($row) ? intval($row['is_done'] ?? 0) : 0;
        $new = ($current === 1) ? 0 : 1;

        if (!is_array($row)) {
            $wpdb->insert(
                $table,
                [
                    'work_date' => $work_date,
                    'key_type' => $key_type,
                    'key_id' => $key_id,
                    'is_done' => $new,
                    'done_at' => ($new === 1) ? current_time('mysql') : null,
                    'updated_at' => current_time('mysql'),
                ],
                ['%s','%s','%d','%d','%s','%s']
            );
        } else {
            $wpdb->update(
                $table,
                [
                    'is_done' => $new,
                    'done_at' => ($new === 1) ? current
