import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectModule } from 'primeng/select'
import { CardModule } from 'primeng/card'
import { BadgeModule } from 'primeng/badge'
import { DialogModule } from 'primeng/dialog'
import { TooltipModule } from 'primeng/tooltip'
import { Subscription } from 'rxjs'
import type { Annotation, Claim, Feature, FeatureChangeKind, FeatureDiff, FeatureReviewItem, ReviewBatch, Role, ValidationIssue, WorkbenchState } from './models'
import { WorkbenchService } from './workbench.service'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule, SelectModule, CardModule, BadgeModule, DialogModule, TooltipModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  state: WorkbenchState
  issues: ValidationIssue[] = []
  history = { past: 0, future: 0 }
  compareA = ''
  compareB = ''
  annotationDraft = ''
  versionDialog = false
  versionName = ''
  activeIssue: ValidationIssue | null = null
  reviewKindFilter: FeatureChangeKind | 'all' = 'all'
  reviewStatusFilter: 'all' | 'pending' | 'confirmed' | 'rejected' = 'all'
  reviewAssignMessage = ''
  readonly reviewKindOptions: Array<{ label: string; value: FeatureChangeKind | 'all' }> = [
    { label: '全部差异', value: 'all' },
    { label: '新增特征', value: 'added' },
    { label: '移除特征', value: 'removed' },
    { label: '调整特征', value: 'modified' }
  ]
  readonly reviewStatusOptions: Array<{ label: string; value: 'all' | 'pending' | 'confirmed' | 'rejected' }> = [
    { label: '全部状态', value: 'all' },
    { label: '待确认', value: 'pending' },
    { label: '已确认', value: 'confirmed' },
    { label: '已驳回', value: 'rejected' }
  ]
  roleOptions: Array<{ label: string; value: Role }> = [
    { label: '代理人（可编辑主数据与本人批注）', value: 'author' },
    { label: '审查员（可编辑本人批注）', value: 'examiner' },
    { label: '观察者（只读）', value: 'viewer' }
  ]
  private subscriptions = new Subscription()

  constructor(readonly service: WorkbenchService) {
    this.state = service.snapshot
  }

  ngOnInit(): void {
    this.subscriptions.add(this.service.state$.subscribe(state => {
      this.state = structuredClone(state)
      this.syncVersions()
    }))
    this.subscriptions.add(this.service.issues$.subscribe(issues => this.issues = issues))
    this.subscriptions.add(this.service.history$.subscribe(history => this.history = history))
    window.addEventListener('keydown', this.handleKeyboard)
  }

  ngAfterViewInit(): void {
    const position = this.service.readPosition()
    setTimeout(() => window.scrollTo({ top: position.scrollY || 0, behavior: 'instant' as ScrollBehavior }), 0)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
    window.removeEventListener('keydown', this.handleKeyboard)
  }

  get selectedClaim(): Claim | undefined { return this.state.claims.find(item => item.id === this.state.selectedClaimId) }
  get selectedFeature(): Feature | undefined { return this.state.features.find(item => item.id === this.state.selectedFeatureId) }
  get claimFeatures(): Feature[] { return this.state.features.filter(item => item.claimId === this.state.selectedClaimId) }
  get featureAnnotations(): Annotation[] { return this.selectedFeature ? this.state.annotations.filter(item => item.featureId === this.selectedFeature?.id) : [] }
  get currentRoleLabel(): string { return this.roleOptions.find(item => item.value === this.state.role)?.label || '' }
  get errorCount(): number { return this.issues.filter(item => item.severity === 'error').length }
  get warningCount(): number { return this.issues.filter(item => item.severity === 'warning').length }
  get canEditMainData(): boolean { return this.state.role !== 'viewer' }
  get mappedFeatureCount(): number { return this.claimFeatures.filter(feature => feature.supportIds.length > 0).length }

  claimLabel(id: string): string { return this.state.claims.find(item => item.id === id)?.title || '未命名权利要求' }
  featureLabel(id: string): string { return this.state.features.find(item => item.id === id)?.label || id }
  paragraphLabel(id: string): string { return this.state.paragraphs.find(item => item.id === id)?.section || id }
  isMapped(feature: Feature, paragraphId: string): boolean { return feature.supportIds.includes(paragraphId) }
  isOwnAnnotation(annotation: Annotation): boolean { return annotation.authorRole === this.state.role }
  ownerLabel(role: Role): string { return ({ author: '代理人', examiner: '审查员', viewer: '观察者' })[role] }

  updateClaimField(field: 'title' | 'text' | 'number' | 'independent', event: Event): void {
    const element = event.target as HTMLInputElement
    const value = field === 'number' ? Number(element.value) : field === 'independent' ? element.checked : element.value
    this.service.updateClaim({ [field]: value })
  }

  updateFeatureField(field: 'label' | 'text', event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value })
  }

  updateFeatureParent(event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { parentId: (event.target as HTMLSelectElement).value || null })
  }

  toggleReference(featureId: string, checked: boolean): void {
    if (!this.selectedFeature) return
    const ids = checked
      ? Array.from(new Set([...this.selectedFeature.referenceIds, featureId]))
      : this.selectedFeature.referenceIds.filter(id => id !== featureId)
    this.service.updateFeature(this.selectedFeature.id, { referenceIds: ids })
  }

  addAnnotation(): void {
    if (!this.selectedFeature) return
    this.service.addAnnotation(this.selectedFeature.id, this.annotationDraft)
    this.annotationDraft = ''
  }

  updateAnnotation(annotation: Annotation, event: Event): void {
    this.service.updateAnnotation(annotation.id, (event.target as HTMLTextAreaElement).value)
  }

  createVersion(): void {
    this.service.createVersion(this.versionName)
    this.versionName = ''
    this.versionDialog = false
  }

  restoreVersion(id: string): void {
    this.service.restoreVersion(id)
  }

  getVersion(id: string) { return this.state.versions.find(item => item.id === id) }
  compareRows(): Array<{ label: string; before: string; after: string; changed: boolean }> {
    const a = this.getVersion(this.compareA)
    const b = this.getVersion(this.compareB)
    if (!a || !b) return []
    const ids = Array.from(new Set([...a.claims.map(item => item.id), ...b.claims.map(item => item.id)]))
    return ids.map(id => {
      const before = a.claims.find(item => item.id === id)?.text || ''
      const after = b.claims.find(item => item.id === id)?.text || ''
      return { label: `权利要求 ${a.claims.find(item => item.id === id)?.number || b.claims.find(item => item.id === id)?.number || '?'}`, before, after, changed: before !== after }
    })
  }

  get featureDiffs(): FeatureDiff[] {
    if (!this.compareA || !this.compareB || this.compareA === this.compareB) return []
    const a = this.getVersion(this.compareA)
    const b = this.getVersion(this.compareB)
    if (!a || !b) return []
    return this.service.diffFeatures(a.features, b.features, b.claims)
  }

  get reviewBatch(): ReviewBatch | null {
    if (!this.compareA || !this.compareB || this.compareA === this.compareB) return null
    return this.state.reviewBatches.find(batch => batch.baseVersionId === this.compareA && batch.targetVersionId === this.compareB) || null
  }

  get filteredFeatureDiffs(): FeatureDiff[] {
    return this.featureDiffs.filter(diff => {
      if (this.reviewKindFilter !== 'all' && diff.kind !== this.reviewKindFilter) return false
      if (this.reviewStatusFilter !== 'all' && this.reviewItemOf(diff.featureId).status !== this.reviewStatusFilter) return false
      return true
    })
  }

  get reviewCounts(): { total: number; pending: number; confirmed: number; rejected: number } {
    const counts = { total: this.featureDiffs.length, pending: 0, confirmed: 0, rejected: 0 }
    for (const diff of this.featureDiffs) counts[this.reviewItemOf(diff.featureId).status]++
    return counts
  }

  reviewItemOf(featureId: string): FeatureReviewItem {
    const existing = this.reviewBatch?.items.find(item => item.featureId === featureId)
    return existing || { featureId, status: 'pending', opinion: '', updatedAt: '', authorRole: this.state.role, authorName: '' }
  }

  reviewKindLabel(kind: FeatureChangeKind): string {
    return ({ added: '新增', removed: '移除', modified: '调整' })[kind]
  }

  reviewStatusLabel(status: 'pending' | 'confirmed' | 'rejected'): string {
    return ({ pending: '待确认', confirmed: '已确认', rejected: '已驳回' })[status]
  }

  featureNameInVersion(versionId: string, featureId: string | null): string {
    if (!featureId) return '无'
    const version = this.getVersion(versionId)
    return version?.features.find(item => item.id === featureId)?.label || featureId
  }

  supportSection(id: string): string {
    return this.state.paragraphs.find(item => item.id === id)?.section || id
  }

  ensureReviewBatch(): void {
    if (!this.compareA || !this.compareB || this.compareA === this.compareB) return
    this.service.ensureReviewBatch(this.compareA, this.compareB)
  }

  assignReviewBatch(): void {
    if (!this.compareA || !this.compareB || this.compareA === this.compareB) return
    const kinds: FeatureChangeKind[] = this.reviewKindFilter === 'all' ? ['added', 'removed', 'modified'] : [this.reviewKindFilter]
    const touched = this.service.assignReviewBatch(this.compareA, this.compareB, kinds)
    this.reviewAssignMessage = touched
      ? `已按当前筛选指派 ${kinds.length === 3 ? '全部差异' : this.reviewKindLabel(kinds[0])}：新增/更新 ${touched} 项，已定稿项保持原样。`
      : '当前筛选下没有可指派的未定稿差异项。'
  }

  setReviewStatus(featureId: string, status: 'pending' | 'confirmed' | 'rejected'): void {
    this.service.setReviewStatus(this.compareA, this.compareB, featureId, status)
  }

  setReviewOpinion(featureId: string, event: Event): void {
    this.service.setReviewOpinion(this.compareA, this.compareB, featureId, (event.target as HTMLTextAreaElement).value)
  }

  exportFile(type: 'json' | 'csv'): void {
    const content = type === 'json' ? this.service.exportJson() : this.service.exportCsv()
    const mime = type === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `patent-claim-check-${new Date().toISOString().slice(0, 10)}.${type}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  locateIssue(issue: ValidationIssue): void {
    this.activeIssue = issue
    if (issue.featureId) this.service.selectFeature(issue.featureId)
    this.service.setTab('mapping')
  }

  closeIssue(): void { this.activeIssue = null }

  private syncVersions(): void {
    if (!this.state.versions.some(item => item.id === this.compareA)) this.compareA = this.state.versions[1]?.id || this.state.versions[0]?.id || ''
    if (!this.state.versions.some(item => item.id === this.compareB)) this.compareB = this.state.versions[0]?.id || ''
  }

  private handleKeyboard = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey)) return
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? this.service.redo() : this.service.undo()
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault()
      this.service.redo()
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      this.versionDialog = true
    }
  }
}
