-- ---------------------------------------------------------------------------
-- BedSMP / GTA RP server - full schema.
--
-- Safe to run more than once: every statement is CREATE ... IF NOT EXISTS.
-- Run it before starting the server:
--     mysql -u fivem -p fivem < sql/001_schema.sql
-- The installers do this automatically.
--
-- Identifiers are the Rockstar licence string ("license:xxxx"), the same key
-- every resource already used for its JSON files.
-- ---------------------------------------------------------------------------

SET NAMES utf8mb4;

-- --- shared -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS settings (
    `key`   VARCHAR(64)  NOT NULL,
    `value` TEXT         NOT NULL,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --- characters (ls_character) ----------------------------------------------

CREATE TABLE IF NOT EXISTS characters (
    identifier  VARCHAR(64)  NOT NULL,
    gender      ENUM('male','female') NOT NULL DEFAULT 'male',
    first_name  VARCHAR(32)  NOT NULL,
    last_name   VARCHAR(32)  NOT NULL,
    static      INT UNSIGNED NOT NULL,
    appearance  JSON         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (identifier),
    UNIQUE KEY uq_characters_static (static)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --- wallet and cars (phone_garage) -----------------------------------------

CREATE TABLE IF NOT EXISTS players (
    identifier VARCHAR(64)  NOT NULL,
    money      BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_cars (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    identifier VARCHAR(64)  NOT NULL,
    model      VARCHAR(64)  NOT NULL,
    label      VARCHAR(96)  NOT NULL,
    plate      VARCHAR(16)  NOT NULL,
    price      BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_player_cars_plate (plate),
    KEY ix_player_cars_owner (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS parking_spots (
    id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    x     DOUBLE       NOT NULL,
    y     DOUBLE       NOT NULL,
    z     DOUBLE       NOT NULL,
    h     DOUBLE       NOT NULL DEFAULT 0,
    label VARCHAR(64)  NOT NULL DEFAULT '',
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --- inventory (ls_inventory) ------------------------------------------------

CREATE TABLE IF NOT EXISTS inventories (
    identifier VARCHAR(64) NOT NULL,
    backpack   TINYINT(1)  NOT NULL DEFAULT 0,
    PRIMARY KEY (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS inventory_slots (
    identifier VARCHAR(64)  NOT NULL,
    slot       SMALLINT UNSIGNED NOT NULL,
    item       VARCHAR(64)  NOT NULL,
    count      INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (identifier, slot),
    KEY ix_inventory_slots_item (item)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --- appearance and outfits (ls_shops) ---------------------------------------

CREATE TABLE IF NOT EXISTS player_looks (
    identifier VARCHAR(64) NOT NULL,
    data       JSON        NOT NULL,
    PRIMARY KEY (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS player_outfits (
    id         VARCHAR(32) NOT NULL,
    identifier VARCHAR(64) NOT NULL,
    name       VARCHAR(32) NOT NULL,
    look       JSON        NOT NULL,
    PRIMARY KEY (id),
    KEY ix_player_outfits_owner (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS custom_shops (
    id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    type  VARCHAR(16)  NOT NULL,
    x     DOUBLE       NOT NULL,
    y     DOUBLE       NOT NULL,
    z     DOUBLE       NOT NULL,
    label VARCHAR(64)  NOT NULL DEFAULT '',
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- --- documents (ls_rp) --------------------------------------------------------
-- kind: passport | medcard | vehicle | driver | weapon

CREATE TABLE IF NOT EXISTS documents (
    id         VARCHAR(32) NOT NULL,
    identifier VARCHAR(64) NOT NULL,
    kind       VARCHAR(16) NOT NULL,
    data       JSON        NOT NULL,
    revoked    TINYINT(1)  NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY ix_documents_owner (identifier),
    KEY ix_documents_kind (kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===========================================================================
-- POLICE (ls_police)
-- ===========================================================================

-- Who is on the force and at what rank. Duty itself is runtime state and is
-- deliberately NOT stored: a server restart takes everyone off duty.
CREATE TABLE IF NOT EXISTS police_officers (
    identifier VARCHAR(64)  NOT NULL,
    rank       SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    callsign   VARCHAR(16)  NOT NULL DEFAULT '',
    hired_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Restraints survive relog and restart, which is the whole point of storing
-- them: logging out must not be an escape.
CREATE TABLE IF NOT EXISTS police_cuffs (
    identifier VARCHAR(64) NOT NULL,
    kind       ENUM('soft','hard') NOT NULL DEFAULT 'hard',
    by_name    VARCHAR(64) NOT NULL DEFAULT '',
    since      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS police_jail (
    identifier VARCHAR(64)  NOT NULL,
    until_ts   BIGINT       NOT NULL,
    reason     VARCHAR(191) NOT NULL DEFAULT '',
    by_name    VARCHAR(64)  NOT NULL DEFAULT '',
    bail       BIGINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS police_wanted (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    identifier VARCHAR(64)  NOT NULL,
    level      TINYINT UNSIGNED NOT NULL DEFAULT 1,
    reason     VARCHAR(191) NOT NULL DEFAULT '',
    by_name    VARCHAR(64)  NOT NULL DEFAULT '',
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cleared    TINYINT(1)   NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY ix_police_wanted_open (identifier, cleared)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS police_fines (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    identifier VARCHAR(64)  NOT NULL,
    amount     BIGINT       NOT NULL,
    reason     VARCHAR(191) NOT NULL DEFAULT '',
    by_name    VARCHAR(64)  NOT NULL DEFAULT '',
    paid       TINYINT(1)   NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_police_fines_owner (identifier, paid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS police_seized (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    identifier VARCHAR(64)  NOT NULL,
    item       VARCHAR(64)  NOT NULL,
    count      INT UNSIGNED NOT NULL DEFAULT 1,
    by_name    VARCHAR(64)  NOT NULL DEFAULT '',
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_police_seized_owner (identifier)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS police_impound (
    plate      VARCHAR(16)  NOT NULL,
    identifier VARCHAR(64)  NOT NULL DEFAULT '',
    reason     VARCHAR(191) NOT NULL DEFAULT '',
    by_name    VARCHAR(64)  NOT NULL DEFAULT '',
    fee        BIGINT       NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (plate)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every police action lands here as well as in Discord, so the record survives
-- a deleted webhook message.
CREATE TABLE IF NOT EXISTS police_logs (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    action     VARCHAR(32)  NOT NULL,
    actor      VARCHAR(64)  NOT NULL DEFAULT '',
    target     VARCHAR(64)  NOT NULL DEFAULT '',
    detail     VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_police_logs_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
