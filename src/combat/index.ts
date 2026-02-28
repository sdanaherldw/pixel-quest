// ---------------------------------------------------------------------------
// Combat module — barrel export
// ---------------------------------------------------------------------------

// CombatManager
export {
  CombatState,
  DamageType,
  CombatantTeam,
  CombatEventType,
  CombatManager,
  type CombatStats,
  type CombatPosition,
  type Combatant,
  type LootDrop,
  type CombatReward,
  type CombatActionResult,
  type EnemySpawnConfig,
  type CombatEvent,
  type CombatEventListener,
  GLOBAL_COOLDOWN,
} from './CombatManager';

// ProjectileSystem
export {
  ProjectileType,
  ProjectileBehavior,
  ProjectileSystem,
  type Projectile,
  type ProjectileVisual,
  type ProjectileSpawnConfig,
  type CollisionTarget,
  type ProjectileHit,
  type HomingTarget,
} from './ProjectileSystem';

// StatusEffectSystem
export {
  StatusType,
  StatusEffectName,
  STATUS_TEMPLATES,
  StatusEffectSystem,
  type StatusEffect,
  type StatusEffectTemplate,
  type TickCallback,
  type EffectLifecycleCallback,
  type EffectImmunity,
} from './StatusEffectSystem';

// EnemyAI
export {
  BehaviorType,
  AIState,
  AIActionType,
  EnemyAI,
  type Vec2,
  type AICombatantState,
  type AIAction,
  DODGE_DISTANCE,
} from './EnemyAI';

// BossAI
export {
  BossAI,
  createBossAI,
  type BossPhase,
  type BossDialogue,
  type BossConfig,
  type PhaseTransitionResult,
  type EnrageStatus,
} from './BossAI';

// CompanionAI
export {
  CompanionCommand,
  CompanionRole,
  CompanionState,
  CompanionActionType,
  CompanionAI,
  type CompanionCombatantState,
  type EnemyCombatantState,
  type CompanionAction,
} from './CompanionAI';

// ComboSystem
export {
  ComboSystem,
  type ComboInput,
  type ComboEffect,
  type ComboDefinition,
  type ActiveCombo,
  type ComboResult,
} from './ComboSystem';

// LimitBreakSystem
export {
  LimitBreakSystem,
  type LimitBreakMeter,
  type PartyMeter,
  type LimitBreak,
} from './LimitBreakSystem';

// CombatOrchestrator
export {
  CombatOrchestrator,
  type AbilityDef,
  type OrchestratorConfig,
} from './CombatOrchestrator';

// ElementalSystem
export {
  Element,
  ElementalSystem,
  type ElementalReaction,
  type ElementalProfile,
} from './ElementalSystem';
