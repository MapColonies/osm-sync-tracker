# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [3.1.0](https://github.com/MapColonies/osm-sync-tracker/compare/v3.0.0...v3.1.0) (2022-06-03)


### Features

* **file:** patch endpoint ([#44](https://github.com/MapColonies/osm-sync-tracker/issues/44)) ([eb09fe5](https://github.com/MapColonies/osm-sync-tracker/commit/eb09fe585bf803e446bd12896a84642fdeff83c6))


### Bug Fixes

* closing a sync or file will set end_date without timezone ([#42](https://github.com/MapColonies/osm-sync-tracker/issues/42)) ([2c5ca50](https://github.com/MapColonies/osm-sync-tracker/commit/2c5ca50eabfc298cb49bf9a079a679ddbbff90af))

## [3.0.0](https://github.com/MapColonies/osm-sync-tracker/compare/v2.1.0...v3.0.0) (2022-04-28)


### ⚠ BREAKING CHANGES

* **sync:** sync rerun compatibility (#37)

### Features

* **sync:** sync rerun compatibility ([#37](https://github.com/MapColonies/osm-sync-tracker/issues/37)) ([ecef85e](https://github.com/MapColonies/osm-sync-tracker/commit/ecef85e823cc540805e0abc8c4fc3b4595654cf0))

## [2.1.0](https://github.com/MapColonies/osm-sync-tracker/compare/v2.0.0...v2.1.0) (2021-12-30)


### Features

* **sync:** prevent multiple full syncs with same layerId and geometry type ([#34](https://github.com/MapColonies/osm-sync-tracker/issues/34)) ([adc1475](https://github.com/MapColonies/osm-sync-tracker/commit/adc1475a0cb55091965f7191d398682273f8528b))

## [2.0.0](https://github.com/MapColonies/osm-sync-tracker/compare/v1.5.1...v2.0.0) (2021-12-23)


### Features

* **sync:** sync geometry type ([#32](https://github.com/MapColonies/osm-sync-tracker/issues/32)) ([40276f6](https://github.com/MapColonies/osm-sync-tracker/commit/40276f6322604c24d0208aeeb97c1cfd81608bfc))

### [1.5.1](https://github.com/MapColonies/osm-sync-tracker/compare/v1.5.0...v1.5.1) (2021-12-21)

## [1.5.0](https://github.com/MapColonies/osm-sync-tracker/compare/v1.4.0...v1.5.0) (2021-11-07)


### Features

* **changeset, entity:** improved quries performance ([#30](https://github.com/MapColonies/osm-sync-tracker/issues/30)) ([a34be66](https://github.com/MapColonies/osm-sync-tracker/commit/a34be6658503ece0cf7234dd962633e057a73ab6))

## [1.4.0](https://github.com/MapColonies/osm-sync-tracker/compare/v1.3.0...v1.4.0) (2021-10-31)


### Features

* **changeset:** separate closing changeset entities and try closing changeset files and sync ([#28](https://github.com/MapColonies/osm-sync-tracker/issues/28)) ([75a83eb](https://github.com/MapColonies/osm-sync-tracker/commit/75a83eb583fbfb3b27e1307e814946a72275e291))


### Bug Fixes

* **configurations:** helm tag definition helper adds v as header to default ([#23](https://github.com/MapColonies/osm-sync-tracker/issues/23)) ([85b1dfd](https://github.com/MapColonies/osm-sync-tracker/commit/85b1dfd1214dd5a0460652916bce11ee11f3449f))
* **entity:** patching an entity while retries is configured bug fix ([#25](https://github.com/MapColonies/osm-sync-tracker/issues/25)) ([a821269](https://github.com/MapColonies/osm-sync-tracker/commit/a821269e4f39b9c5455a292b6484d84e5519da06))

## [1.3.0](https://github.com/MapColonies/osm-sync-tracker/compare/v1.2.4...v1.3.0) (2021-09-09)


### Features

* **changeset:** transaction isolation with retry policy ([#21](https://github.com/MapColonies/osm-sync-tracker/issues/21)) ([7600b0e](https://github.com/MapColonies/osm-sync-tracker/commit/7600b0ebd5d9a76b27fa6f48db2e801dda6b51ad))


### Bug Fixes

* **configurations:** added readinessProbe to helm chart ([#19](https://github.com/MapColonies/osm-sync-tracker/issues/19)) ([aa59fe2](https://github.com/MapColonies/osm-sync-tracker/commit/aa59fe23987041500799cceac0d75211b65033cc))

### [1.2.4](https://github.com/MapColonies/osm-sync-tracker/compare/v1.2.3...v1.2.4) (2021-08-18)


### Bug Fixes

* **file:** closing file had sql syntax error, added proper tests ([#18](https://github.com/MapColonies/osm-sync-tracker/issues/18)) ([8624233](https://github.com/MapColonies/osm-sync-tracker/commit/8624233005287f2be83c73088d709a432f92b7c2))

### [1.2.3](https://github.com/MapColonies/osm-sync-tracker/compare/v1.2.2...v1.2.3) (2021-08-04)

### [1.2.2](https://github.com/MapColonies/osm-sync-tracker/compare/v1.2.1...v1.2.2) (2021-08-03)

### [1.2.1](https://github.com/MapColonies/osm-sync-tracker/compare/v1.2.0...v1.2.1) (2021-07-29)


### Bug Fixes

* close sync now working ([#16](https://github.com/MapColonies/osm-sync-tracker/issues/16)) ([b15fe25](https://github.com/MapColonies/osm-sync-tracker/commit/b15fe25f41260a2ebb0b22497477af47af885a08))

## [1.2.0](https://github.com/MapColonies/osm-sync-tracker/compare/v1.1.3...v1.2.0) (2021-07-21)


### Features

* **configurations:** add helm chart to spec ([#14](https://github.com/MapColonies/osm-sync-tracker/issues/14)) ([c06f18b](https://github.com/MapColonies/osm-sync-tracker/commit/c06f18b92bcde2f78a6f81d5324ce8d225fcabb6))

### [1.1.3](https://github.com/MapColonies/osm-sync-tracker/compare/v1.1.2...v1.1.3) (2021-06-16)


### Bug Fixes

* **configurations:** fixed broken migrations ([#12](https://github.com/MapColonies/osm-sync-tracker/issues/12)) ([49a4619](https://github.com/MapColonies/osm-sync-tracker/commit/49a4619839b242bfda22b0cd71e4bc161aacbaee))

### [1.1.2](https://github.com/MapColonies/osm-sync-tracker/compare/v1.1.1...v1.1.2) (2021-06-13)


### Bug Fixes

* **entity:** diffrentiate entities by fileId ([#10](https://github.com/MapColonies/osm-sync-tracker/issues/10)) ([262e9c3](https://github.com/MapColonies/osm-sync-tracker/commit/262e9c3fe0ac8d01e0397c8c07148c8a403739c3))

### [1.1.1](https://github.com/MapColonies/osm-sync-tracker/compare/v1.1.0...v1.1.1) (2021-06-09)


### Bug Fixes

* **changeset:** fixed changeset closing doesn't close the sync ([#9](https://github.com/MapColonies/osm-sync-tracker/issues/9)) ([387010e](https://github.com/MapColonies/osm-sync-tracker/commit/387010ea4a8d6271209291a5982aa3dddede0319))

## [1.1.0](https://github.com/MapColonies/osm-sync-tracker/compare/v1.0.0...v1.1.0) (2021-06-09)


### Features

* **entity:** add bulk update of entities ([#8](https://github.com/MapColonies/osm-sync-tracker/issues/8)) ([0ebf0e6](https://github.com/MapColonies/osm-sync-tracker/commit/0ebf0e6a3031fb4141a5264ffca002879019e5a0))

## 1.0.0 (2021-06-08)


### Features

* **sync, file, entity, changeset:** implemented API v1.0.0  ([#7](https://github.com/MapColonies/osm-sync-tracker/issues/7)) ([457b40e](https://github.com/MapColonies/osm-sync-tracker/commit/457b40ee0fe3a7461935e53897e2c388c2fdfc56))
* created openapi spec ([#3](https://github.com/MapColonies/osm-sync-tracker/issues/3)) ([2291d63](https://github.com/MapColonies/osm-sync-tracker/commit/2291d634e622353499fbc099e138ed9d9aa614a6))
