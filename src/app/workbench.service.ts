import { Injectable, OnDestroy } from '@angular/core'
import { BehaviorSubject, map, type Observable } from 'rxjs'
import type {
  Annotation, Claim, ClaimVersion, Feature, FeatureComparisonEntry, FeatureDiffField,
  FeatureReviewBatch, FeatureReviewEntry, Paragraph, Position, ReviewStatus, Role,
  ValidationIssue, WorkbenchState
} from './models'

const STORAGE_KEY = 'patent-claim-mapping-workbench-v1'
const POSITION_KEY = 'patent-claim-mapping-position-v1'

const initialClaims: Claim[] = [
  { id: 'claim-1', number: 1, title: '一种自适应展柜环境控制装置', independent: true, text: '一种自适应展柜环境控制装置，包括：柜体；环境传感模块，设置于所述柜体内并用于采集温湿度数据；以及控制模块，与所述环境传感模块通信，并根据所述温湿度数据调节所述柜体的微环境。' },
  { id: 'claim-2', number: 2, title: '传感模块的布置方式', independent: false, text: '根据权利要求1所述的装置，其特征在于，所述环境传感模块包括沿所述柜体对角线布置的多个温湿度传感器。' },
  { id: 'claim-3', number: 3, title: '控制模块的调节策略', independent: false, text: '根据权利要求1所述的装置，其特征在于，所述控制模块基于历史数据与当前数据之间的偏差分级调节除湿单元。' }
]
const initialParagraphs: Paragraph[] = [
  { id: 'para-0012', section: '说明书 [0012]', text: '柜体1形成用于陈列文物的封闭空间。环境传感模块2安装于柜体内部，可采集温度、相对湿度等环境数据，并将数据发送至控制模块3。' },
  { id: 'para-0018', section: '说明书 [0018]', text: '在一种实施方式中，多个温湿度传感器沿柜体对角线布置，由此可降低局部气流造成的测量偏差。传感器数量可根据柜体容积设定。' },
  { id: 'para-0024', section: '说明书 [0024]', text: '控制模块可比较当前湿度与预设区间，并结合历史变化趋势生成调节等级。当偏差持续超过阈值时，控制模块启动除湿单元并提高调节频率。' },
  { id: 'para-0031', section: '说明书 [0031]', text: '控制模块与传感模块之间可以采用有线或无线通信。通信链路可周期传输数据，传输周期例如为十秒至五分钟。' },
  { id: 'para-0040', section: '说明书 [0040]', text: '微环境调节包括湿度调节、温度调节及气体交换。控制策略可记录执行结果，用于后续趋势判断。' }
]
const initialFeatures: Feature[] = [
  { id: 'feature-a', claimId: 'claim-1', label: 'A · 柜体', text: '柜体', parentId: null, referenceIds: [], supportIds: ['para-0012'], ownerRole: 'author' },
  { id: 'feature-b', claimId: 'claim-1', label: 'B · 环境传感模块', text: '设置于柜体内，用于采集温湿度数据', parentId: 'feature-a', referenceIds: [], supportIds: ['para-0012', 'para-0018'], ownerRole: 'author' },
  { id: 'feature-c', claimId: 'claim-1', label: 'C · 控制模块通信', text: '与环境传感模块通信', parentId: 'feature-a', referenceIds: ['feature-b'], supportIds: ['para-0012', 'para-0031'], ownerRole: 'author' },
  { id: 'feature-d', claimId: 'claim-1', label: 'D · 调节微环境', text: '根据温湿度数据调节柜体微环境', parentId: null, referenceIds: ['feature-b', 'feature-c'], supportIds: ['para-0024', 'para-0040'], ownerRole: 'author' },
  { id: 'feature-e', claimId: 'claim-2', label: 'E · 对角线布置', text: '多个温湿度传感器沿柜体对角线布置', parentId: null, referenceIds: [], supportIds: ['para-0018'], ownerRole: 'author' },
  { id: 'feature-f', claimId: 'claim-3', label: 'F · 分级调节', text: '基于历史数据与当前数据的偏差分级调节除湿单元', parentId: null, referenceIds: [], supportIds: ['para-0024'], ownerRole: 'author' }
]
const initialAnnotations: Annotation[] = [
  { id: 'annotation-1', featureId: 'feature-b', authorRole: 'examiner', authorName: '审查员 · 李岚', text: '“温湿度数据”是否包括露点等派生数据？建议在从属权利要求中限定。', updatedAt: '2026-09-24T03:10:00.000Z' },
  { id: 'annotation-2', featureId: 'feature-d', authorRole: 'author', authorName: '代理人 · 陈昊', text: '[0024] 已支持分级调节，发布前补充除湿单元与通信模块的连接关系。', updatedAt: '2026-09-24T04:05:00.000Z' }
]
function demoState(): WorkbenchState {
  return {
    claims: initialClaims, paragraphs: initialParagraphs, features: initialFeatures,
    annotations: initialAnnotations, orphanMappings: [], versions: [], reviewBatches: [],
    role: 'author', currentUserRole: 'author', selectedClaimId: 'claim-1', selectedFeatureId: 'feature-b', activeTab: 'mapping'
  }
}
function clone<T>(value: T): T { return structuredClone(value) }

@Injectable({ providedIn: 'root' })
export class WorkbenchService implements OnDestroy {
  private readonly initialState = this.loadState()
  private readonly stateSubject = new BehaviorSubject<WorkbenchState>(this.initialState)
  private readonly historySubject = new BehaviorSubject<{ past: number; future: number }>({ past: 0, future: 0 })
  private past: WorkbenchState[] = []
  private future: WorkbenchState[] = []

  readonly state$ = this.stateSubject.asObservable()
  readonly history$ = this.historySubject.asObservable()
  readonly claims$ = this.state$.pipe(map(state => state.claims))
  readonly paragraphs$ = this.state$.pipe(map(state => state.paragraphs))
  readonly features$ = this.state$.pipe(map(state => state.features))
  readonly annotations$ = this.state$.pipe(map(state => state.annotations))
  readonly role$ = this.state$.pipe(map(state => state.role))
  readonly selectedClaim$ = this.state$.pipe(map(state => state.claims.find(claim => claim.id === state.selectedClaimId) || state.claims[0]))
  readonly selectedFeature$ = this.state$.pipe(map(state => state.features.find(feature => feature.id === state.selectedFeatureId) || null))
  readonly issues$ = this.state$.pipe(map(state => this.validate(state)))

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.savePosition())
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') window.removeEventListener('beforeunload', () => this.savePosition())
  }

  get snapshot(): WorkbenchState { return clone(this.stateSubject.value) }
  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  selectClaim(id: string): void {
    this.patchState(state => { state.selectedClaimId = id; state.selectedFeatureId = state.features.find(feature => feature.claimId === id)?.id || null })
    this.savePosition()
  }

  selectFeature(id: string | null): void {
    this.patchState(state => { state.selectedFeatureId = id })
    this.savePosition()
  }

  setRole(role: Role): void {
    this.patchState(state => { state.role = role; state.currentUserRole = role })
  }

  setTab(tab: string): void {
    this.patchState(state => { state.activeTab = tab })
    this.savePosition()
  }

  updateClaim(patch: Partial<Claim>): void {
    this.commit(state => {
      const claim = state.claims.find(item => item.id === state.selectedClaimId)
      if (claim) Object.assign(claim, patch)
    })
  }

  addClaim(): void {
    this.commit(state => {
      const number = Math.max(0, ...state.claims.map(claim => claim.number)) + 1
      const claim: Claim = { id: `claim-${Date.now()}`, number, title: `权利要求 ${number}`, independent: false, text: '请录入权利要求正文。' }
      state.claims.push(claim)
      state.selectedClaimId = claim.id
      state.selectedFeatureId = null
    })
  }

  addParagraph(): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const next = state.paragraphs.length + 1
      state.paragraphs.push({ id: `para-${Date.now()}`, section: `说明书 [${String(next * 5).padStart(4, '0')}]`, text: '' })
    })
  }

  updateParagraph(id: string, patch: Partial<Paragraph>): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const paragraph = state.paragraphs.find(item => item.id === id)
      if (paragraph) Object.assign(paragraph, patch)
    })
  }

  deleteParagraph(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      state.paragraphs = state.paragraphs.filter(item => item.id !== id)
      state.features.forEach(feature => { feature.supportIds = feature.supportIds.filter(paragraphId => paragraphId !== id) })
      state.orphanMappings = state.orphanMappings.filter(item => item.paragraphId !== id)
    })
  }

  addFeature(): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature: Feature = {
        id: `feature-${Date.now()}`, claimId: state.selectedClaimId,
        label: `新特征 ${state.features.filter(item => item.claimId === state.selectedClaimId).length + 1}`,
        text: '', parentId: null, referenceIds: [], supportIds: [], ownerRole: state.role
      }
      state.features.push(feature)
      state.selectedFeatureId = feature.id
    })
  }

  updateFeature(id: string, patch: Partial<Feature>): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === id)
      if (feature) Object.assign(feature, patch)
    })
  }

  deleteFeature(id: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === id)
      if (!feature) return
      feature.supportIds.forEach(paragraphId => state.orphanMappings.push({
        id: `orphan-${Date.now()}-${paragraphId}`, featureLabel: feature.label, paragraphId,
        reason: `技术特征“${feature.label}”已删除，但支持段落映射仍被保留。`
      }))
      state.features = state.features.filter(item => item.id !== id)
      state.features.forEach(item => {
        item.referenceIds = item.referenceIds.filter(refId => refId !== id)
        if (item.parentId === id) item.parentId = null
      })
      state.annotations = state.annotations.filter(item => item.featureId !== id)
      state.selectedFeatureId = state.features.find(item => item.claimId === state.selectedClaimId)?.id || null
    })
  }

  toggleParagraphMapping(featureId: string, paragraphId: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => {
      const feature = state.features.find(item => item.id === featureId)
      if (!feature) return
      const index = feature.supportIds.indexOf(paragraphId)
      if (index >= 0) feature.supportIds.splice(index, 1)
      else feature.supportIds.push(paragraphId)
      state.orphanMappings = state.orphanMappings.filter(item => item.paragraphId !== paragraphId)
    })
  }

  clearOrphan(id: string): void {
    this.commit(state => { state.orphanMappings = state.orphanMappings.filter(item => item.id !== id) })
  }

  addAnnotation(featureId: string, text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return
    const role = this.stateSubject.value.role
    const names: Record<Role, string> = { author: '代理人 · 陈昊', examiner: '审查员 · 李岚', viewer: '观察者' }
    this.commit(state => state.annotations.push({
      id: `annotation-${Date.now()}`, featureId, authorRole: role, authorName: names[role], text: trimmed, updatedAt: new Date().toISOString()
    }))
  }

  updateAnnotation(id: string, text: string): void {
    this.commit(state => {
      const annotation = state.annotations.find(item => item.id === id)
      if (annotation && annotation.authorRole === state.role) annotation.text = text
    })
  }

  deleteAnnotation(id: string): void {
    this.commit(state => {
      const annotation = state.annotations.find(item => item.id === id)
      if (annotation && annotation.authorRole === state.role) state.annotations = state.annotations.filter(item => item.id !== id)
    })
  }

  createVersion(name?: string): void {
    this.commit(state => {
      state.versions.unshift({
        id: `version-${Date.now()}`, name: name?.trim() || `快照 ${new Date().toLocaleString('zh-CN', { hour12: false })}`,
        createdAt: new Date().toISOString(), claims: clone(state.claims), features: clone(state.features)
      })
    })
  }

  restoreVersion(id: string): void {
    this.commit(state => {
      const version = state.versions.find(item => item.id === id)
      if (!version) return
      state.claims = clone(version.claims)
      state.features = clone(version.features)
      if (!state.claims.some(claim => claim.id === state.selectedClaimId)) state.selectedClaimId = state.claims[0]?.id || ''
      state.selectedFeatureId = state.features.find(feature => feature.claimId === state.selectedClaimId)?.id || null
    })
  }

  /** 按特征 id 归并两版：返回新增 / 移除 / 调整的特征级条目（含父级、引用、说明书依据差异）。 */
  getFeatureComparisons(baseVersionId: string, targetVersionId: string): FeatureComparisonEntry[] {
    const base = this.stateSubject.value.versions.find(item => item.id === baseVersionId)
    const target = this.stateSubject.value.versions.find(item => item.id === targetVersionId)
    if (!base || !target) return []
    const entries: FeatureComparisonEntry[] = []
    const seen = new Set<string>()
    for (const before of base.features) {
      seen.add(before.id)
      const after = target.features.find(item => item.id === before.id)
      if (after) {
        const fields = this.buildDiffFields(before, after, base, target)
        if (fields.some(field => field.changed)) {
          entries.push({
            featureId: before.id, kind: 'modified',
            claimNumber: target.claims.find(claim => claim.id === after.claimId)?.number
              ?? base.claims.find(claim => claim.id === before.claimId)?.number ?? null,
            label: after.label || before.label, fields
          })
        }
      } else {
        entries.push({
          featureId: before.id, kind: 'removed',
          claimNumber: base.claims.find(claim => claim.id === before.claimId)?.number ?? null,
          label: before.label, fields: this.buildSideFields(before, base, true)
        })
      }
    }
    for (const after of target.features) {
      if (seen.has(after.id)) continue
      entries.push({
        featureId: after.id, kind: 'added',
        claimNumber: target.claims.find(claim => claim.id === after.claimId)?.number ?? null,
        label: after.label, fields: this.buildSideFields(after, target, false)
      })
    }
    return entries
  }

  getReviewBatch(baseVersionId: string, targetVersionId: string): FeatureReviewBatch | undefined {
    return this.stateSubject.value.reviewBatches
      .find(batch => batch.baseVersionId === baseVersionId && batch.targetVersionId === targetVersionId)
  }

  getReviewEntry(baseVersionId: string, targetVersionId: string, featureId: string): FeatureReviewEntry | undefined {
    return this.getReviewBatch(baseVersionId, targetVersionId)?.entries.find(entry => entry.featureId === featureId)
  }

  setFeatureReviewStatus(baseVersionId: string, targetVersionId: string, featureId: string, status: ReviewStatus): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => this.upsertReviewEntry(state, baseVersionId, targetVersionId, featureId, { status }))
  }

  setFeatureReviewComment(baseVersionId: string, targetVersionId: string, featureId: string, comment: string): void {
    if (this.stateSubject.value.role === 'viewer') return
    this.commit(state => this.upsertReviewEntry(state, baseVersionId, targetVersionId, featureId, { comment }))
  }

  /**
   * 代理人批量指派：仅作用于当前筛选（条目 id 集合）中状态为“待确认”的特征，
   * 已确认 / 已驳回的定稿项保持原样；提供意见时仅写入未填写意见的待确认项，不覆盖已有意见。
   */
  batchAssignReview(baseVersionId: string, targetVersionId: string, featureIds: string[], status: ReviewStatus, comment: string): number {
    if (this.stateSubject.value.role !== 'author') return 0
    const scope = new Set(featureIds)
    let affected = 0
    this.commit(state => {
      for (const featureId of scope) {
        const existing = this.findReviewEntry(state, baseVersionId, targetVersionId, featureId)
        if (existing && existing.status !== 'pending') continue
        const trimmed = comment.trim()
        this.upsertReviewEntry(state, baseVersionId, targetVersionId, featureId, {
          status,
          comment: !existing?.comment && trimmed ? trimmed : undefined
        })
        affected += 1
      }
    })
    return affected
  }

  undo(): void {
    const previous = this.past.pop()
    if (!previous) return
    this.future.push(clone(this.stateSubject.value))
    this.stateSubject.next(previous)
    this.updateHistory()
    this.saveState()
  }

  redo(): void {
    const next = this.future.pop()
    if (!next) return
    this.past.push(clone(this.stateSubject.value))
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
  }

  savePosition(): void {
    if (typeof localStorage === 'undefined') return
    const state = this.stateSubject.value
    const position: Position = { tab: state.activeTab, claimId: state.selectedClaimId, featureId: state.selectedFeatureId, scrollY: window.scrollY }
    localStorage.setItem(POSITION_KEY, JSON.stringify(position))
    this.saveState()
  }

  readPosition(): Position {
    if (typeof localStorage === 'undefined') return { tab: this.initialState.activeTab, claimId: this.initialState.selectedClaimId, featureId: this.initialState.selectedFeatureId, scrollY: 0 }
    try { return { ...JSON.parse(localStorage.getItem(POSITION_KEY) || '{}'), ...this.stateSubject.value } } catch { return { tab: 'mapping', claimId: this.initialState.selectedClaimId, featureId: this.initialState.selectedFeatureId, scrollY: 0 } }
  }

  exportJson(): string {
    return JSON.stringify({
      ...this.snapshot,
      validationIssues: this.validate(this.stateSubject.value),
      featureReviewBatches: this.buildReviewBatchReports()
    }, null, 2)
  }

  private buildReviewBatchReports(): unknown[] {
    const state = this.stateSubject.value
    return state.reviewBatches.map(batch => {
      const base = state.versions.find(item => item.id === batch.baseVersionId)
      const target = state.versions.find(item => item.id === batch.targetVersionId)
      const comparisons = this.getFeatureComparisons(batch.baseVersionId, batch.targetVersionId)
      return {
        baseVersion: base ? { id: base.id, name: base.name, createdAt: base.createdAt } : { id: batch.baseVersionId, name: '（版本已删除）' },
        targetVersion: target ? { id: target.id, name: target.name, createdAt: target.createdAt } : { id: batch.targetVersionId, name: '（版本已删除）' },
        summary: {
          pending: batch.entries.filter(entry => entry.status === 'pending').length,
          confirmed: batch.entries.filter(entry => entry.status === 'confirmed').length,
          rejected: batch.entries.filter(entry => entry.status === 'rejected').length
        },
        entries: batch.entries.map(entry => {
          const comparison = comparisons.find(item => item.featureId === entry.featureId)
          const kindLabel: Record<string, string> = { added: '新增', removed: '移除', modified: '调整' }
          const statusLabel: Record<ReviewStatus, string> = { pending: '待确认', confirmed: '已确认', rejected: '已驳回' }
          return {
            featureId: entry.featureId,
            changeKind: comparison?.kind || null,
            changeKindLabel: comparison ? kindLabel[comparison.kind] : '（版本中未找到）',
            label: comparison?.label || entry.featureId,
            status: entry.status,
            statusLabel: statusLabel[entry.status],
            comment: entry.comment,
            updatedByRole: entry.updatedByRole,
            updatedAt: entry.updatedAt
          }
        })
      }
    })
  }

  exportCsv(): string {
    const state = this.stateSubject.value
    const rows = state.features.map(feature => [
      state.claims.find(claim => claim.id === feature.claimId)?.number || '', feature.label, feature.text,
      state.features.find(item => item.id === feature.parentId)?.label || '',
      feature.referenceIds.map(id => state.features.find(item => item.id === id)?.label || id).join('；'),
      feature.supportIds.map(id => state.paragraphs.find(item => item.id === id)?.section || id).join('；')
    ])
    const csv = [['权利要求', '技术特征', '特征内容', '父级特征', '引用特征', '支持段落'], ...rows]
      .map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    return `\uFEFF${csv}`
  }

  validate(state = this.stateSubject.value): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    for (const feature of state.features) {
      if (!feature.text.trim()) issues.push({ id: `empty-${feature.id}`, severity: 'warning', type: 'empty-feature', featureId: feature.id, title: `${feature.label} 内容为空`, detail: '请补全技术特征文字，避免映射对象不明确。' })
      if (!feature.supportIds.length) issues.push({ id: `support-${feature.id}`, severity: 'error', type: 'missing-support', featureId: feature.id, title: `${feature.label} 缺少说明书依据`, detail: '至少为一个说明书段落建立支持映射。' })
      if (this.hasReferenceCycle(feature, state.features)) issues.push({ id: `cycle-${feature.id}`, severity: 'error', type: 'cycle', featureId: feature.id, title: `${feature.label} 存在循环引用`, detail: '特征层级或引用关系形成闭环，请移除其中一条关系。' })
    }
    state.orphanMappings.forEach(item => issues.push({ id: item.id, severity: 'warning', type: 'orphan-mapping', title: '存在待清理映射', detail: item.reason }))
    return issues
  }

  private buildDiffFields(before: Feature, after: Feature, base: ClaimVersion, target: ClaimVersion): FeatureDiffField[] {
    return [
      { key: 'claim', label: '所属权利要求', before: this.claimNameOf(before.claimId, base), after: this.claimNameOf(after.claimId, target), changed: before.claimId !== after.claimId },
      { key: 'label', label: '特征名称', before: before.label, after: after.label, changed: before.label !== after.label },
      { key: 'text', label: '特征正文', before: before.text, after: after.text, changed: before.text !== after.text },
      { key: 'parent', label: '父级特征', before: this.parentNameOf(before, base), after: this.parentNameOf(after, target), changed: before.parentId !== after.parentId },
      { key: 'references', label: '引用特征', before: this.referenceNamesOf(before, base), after: this.referenceNamesOf(after, target), changed: !this.sameIdSet(before.referenceIds, after.referenceIds) },
      { key: 'support', label: '说明书依据', before: this.supportNamesOf(before), after: this.supportNamesOf(after), changed: !this.sameIdSet(before.supportIds, after.supportIds) }
    ]
  }

  /** 新增 / 移除条目：保留同一份字段结构，缺失一侧显示为空。 */
  private buildSideFields(feature: Feature, version: ClaimVersion, removed: boolean): FeatureDiffField[] {
    const value = {
      claim: this.claimNameOf(feature.claimId, version),
      label: feature.label,
      text: feature.text,
      parent: this.parentNameOf(feature, version),
      references: this.referenceNamesOf(feature, version),
      support: this.supportNamesOf(feature)
    }
    const fill = (key: FeatureDiffField['key'], label: string, text: string): FeatureDiffField =>
      removed ? { key, label, before: text, after: '', changed: true } : { key, label, before: '', after: text, changed: true }
    return [
      fill('claim', '所属权利要求', value.claim),
      fill('label', '特征名称', value.label),
      fill('text', '特征正文', value.text),
      fill('parent', '父级特征', value.parent),
      fill('references', '引用特征', value.references),
      fill('support', '说明书依据', value.support)
    ]
  }

  private claimNameOf(claimId: string, version: ClaimVersion): string {
    const claim = version.claims.find(item => item.id === claimId)
    return claim ? `权利要求 ${claim.number} · ${claim.title}` : '（未找到所属项）'
  }

  private parentNameOf(feature: Feature, version: ClaimVersion): string {
    if (!feature.parentId) return '无（顶层特征）'
    return version.features.find(item => item.id === feature.parentId)?.label || `已缺失（${feature.parentId}）`
  }

  private referenceNamesOf(feature: Feature, version: ClaimVersion): string {
    if (!feature.referenceIds.length) return '无'
    return feature.referenceIds.map(id => version.features.find(item => item.id === id)?.label || `已缺失（${id}）`).join('；')
  }

  private supportNamesOf(feature: Feature): string {
    if (!feature.supportIds.length) return '未映射说明书段落'
    const state = this.stateSubject.value
    return feature.supportIds.map(id => state.paragraphs.find(item => item.id === id)?.section || id).join('；')
  }

  private sameIdSet(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every(id => b.includes(id))
  }

  private findReviewEntry(state: WorkbenchState, baseVersionId: string, targetVersionId: string, featureId: string): FeatureReviewEntry | undefined {
    return state.reviewBatches
      .find(batch => batch.baseVersionId === baseVersionId && batch.targetVersionId === targetVersionId)
      ?.entries.find(entry => entry.featureId === featureId)
  }

  private upsertReviewEntry(
    state: WorkbenchState, baseVersionId: string, targetVersionId: string, featureId: string,
    patch: Partial<Pick<FeatureReviewEntry, 'status' | 'comment'>>
  ): void {
    let batch = state.reviewBatches.find(item => item.baseVersionId === baseVersionId && item.targetVersionId === targetVersionId)
    if (!batch) {
      batch = { id: `batch-${Date.now()}-${baseVersionId}-${targetVersionId}`, baseVersionId, targetVersionId, entries: [] }
      state.reviewBatches.push(batch)
    }
    let entry = batch.entries.find(item => item.featureId === featureId)
    if (!entry) {
      entry = { featureId, status: 'pending', comment: '', updatedByRole: null, updatedAt: '' }
      batch.entries.push(entry)
    }
    if (patch.status !== undefined) entry.status = patch.status
    if (patch.comment !== undefined) entry.comment = patch.comment
    entry.updatedByRole = state.role
    entry.updatedAt = new Date().toISOString()
  }

  private hasReferenceCycle(start: Feature, features: Feature[]): boolean {
    const visited = new Set<string>()
    const visit = (id: string): boolean => {
      if (id === start.id && visited.size > 0) return true
      if (visited.has(id)) return false
      visited.add(id)
      const feature = features.find(item => item.id === id)
      if (!feature) return false
      if (feature.parentId && visit(feature.parentId)) return true
      return feature.referenceIds.some(visit)
    }
    return visit(start.id)
  }

  private commit(recipe: (state: WorkbenchState) => void): void {
    const current = clone(this.stateSubject.value)
    const next = clone(current)
    recipe(next)
    this.past.push(current)
    if (this.past.length > 60) this.past.shift()
    this.future = []
    this.stateSubject.next(next)
    this.updateHistory()
    this.saveState()
  }

  private patchState(recipe: (state: WorkbenchState) => void): void {
    const next = clone(this.stateSubject.value)
    recipe(next)
    this.stateSubject.next(next)
    this.saveState()
  }

  private updateHistory(): void { this.historySubject.next({ past: this.past.length, future: this.future.length }) }
  private saveState(): void { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stateSubject.value)) }
  private loadState(): WorkbenchState {
    if (typeof localStorage === 'undefined') return demoState()
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? { ...demoState(), ...JSON.parse(stored) } : demoState()
    } catch { return demoState() }
  }
}
