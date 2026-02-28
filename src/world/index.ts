// ------------------------------------------------------------------
// world – barrel export
// ------------------------------------------------------------------

export { WorldMap } from './WorldMap';
export type {
  RegionData,
  RegionConnection,
  TownRef,
  DungeonRef,
  PointOfInterest,
  TilePosition,
} from './WorldMap';

export { TransitionManager, TransitionType } from './TransitionManager';
export type {
  TransitionZone,
  TransitionSaveState,
  SceneLoadCallback,
} from './TransitionManager';

export { WeatherSystem, WeatherType } from './WeatherSystem';

export { DayNightCycle, TimeOfDay } from './DayNightCycle';

export { TownSystem } from './TownSystem';
export type {
  TownData,
  BuildingData,
  NPCData,
  BuildingType,
  ServiceType,
} from './TownSystem';
