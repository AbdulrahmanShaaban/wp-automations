<?php
/**
 * Plugin Name: Siraj Core
 * Description: Business logic for the Siraj clinic demo (booking form arrives in a later phase). The theme stays presentation-only.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Requires PHP: 8.3
 * Author: OpenCode
 * License: GNU General Public License v2 or later
 * Text Domain: siraj-core
 *
 * @package Siraj
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/booking.php';
require_once __DIR__ . '/hardening.php';
require_once __DIR__ . '/seo.php';
require_once __DIR__ . '/notifier.php';
