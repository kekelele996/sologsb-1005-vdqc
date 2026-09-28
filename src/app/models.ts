export type Role = 'author' | 'examiner' | 'viewer'

export interface Claim {
  id: string
  number: number
  title: string
  text: string
  independent: boolean
}

export interface Paragraph {
  id: string
  section: string
  text: string
}

export interface Feature {
  id: string
  claimId: string
  label: string
  text: string
  parentId: string | null
  referenceIds: string[]
  supportIds: string[]
  ownerRole: Role
}

export interface Annotation {
  id: string
  featureId: string
  authorRole: Role
  authorName: string
  text: string
  updatedAt: string
}

export interface OrphanMapping {
  id: string
  featureLabel: string
  paragraphId: string
  reason: string
}

export type ReviewStatus = 'pending' | 'confirmed' | 'rejected'
export type FeatureChangeKind = 'added' | 'removed' | 'modified'

export interface IdDelta {
  added: string[]
  removed: string[]
}

export interface FeatureDiff {
  kind: FeatureChangeKind
  featureId: string
  claimNumber: number | null
  label: string
  beforeText: string
  afterText: string
  parentDelta: { from: string | null; to: string | null }
  referenceDelta: IdDelta
  supportDelta: IdDelta
}

export interface FeatureReviewItem {
  featureId: string
  status: ReviewStatus
  opinion: string
  updatedAt: string
  authorRole: Role
  authorName: string
}

export interface ReviewBatch {
  id: string
  baseVersionId: string
  targetVersionId: string
  items: FeatureReviewItem[]
}

export interface ClaimVersion {
  id: string
  name: string
  createdAt: string
  claims: Claim[]
  features: Feature[]
}

export interface Position {
  tab: string
  claimId: string
  featureId: string | null
  scrollY: number
}

export interface WorkbenchState {
  claims: Claim[]
  paragraphs: Paragraph[]
  features: Feature[]
  annotations: Annotation[]
  orphanMappings: OrphanMapping[]
  versions: ClaimVersion[]
  reviewBatches: ReviewBatch[]
  role: Role
  selectedClaimId: string
  selectedFeatureId: string | null
  activeTab: string
  currentUserRole: Role
}

export interface ValidationIssue {
  id: string
  severity: 'error' | 'warning'
  type: 'cycle' | 'missing-support' | 'orphan-mapping' | 'empty-feature'
  featureId?: string
  title: string
  detail: string
}
