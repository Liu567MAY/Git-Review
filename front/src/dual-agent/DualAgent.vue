<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import AgentCard from './AgentCard.vue'
import AgentResults from './AgentResults.vue'
import { createReview } from './events'
import { adviceRows, auditRows, reviewError, streamReview, type ReviewEvent } from './stream'
import './agent.css'

const props = defineProps<{ snapshotId?: string }>()
const running = ref(false)
let controller: AbortController | undefined

const { state, dispatch } = createReview()
let transfer: ReturnType<typeof setTimeout> | undefined
let finish: ReturnType<typeof setTimeout> | undefined
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
function stop() { clearTimeout(transfer); clearTimeout(finish) }
onUnmounted(() => { controller?.abort(); stop() })
function idle() {
  stop()
  if (state.handoff==='sending') dispatch({type:'handoff',state:'sent'})
  dispatch({type:'phase',agent:0,animation:'IDLE'})
  dispatch({type:'phase',agent:1,animation:'IDLE'})
}
function reset() {
  idle()
  state.handoff='waiting'
  state.audit=state.advice=null
  state.logs=[]
  state.outcome=''
}
function receive(event: ReviewEvent) {
  switch (event.type) {
    case 'agent.started':
      dispatch({ type: 'phase', agent: event.agent, animation: 'SCAN' })
      state.outcome = event.agent === 0 ? '正在审查 README' : '正在制定修改建议'
      break
    case 'tool.called':
    case 'tool.completed':
      dispatch({ type: 'tool', agent: event.agent, message: [
        event.name, event.summary, event.ok === false ? '调用失败' : undefined,
        event.evidenceCount === undefined ? undefined : event.evidenceCount + ' 项证据',
      ].filter(Boolean).join(' · ') })
      break
    case 'finding.confirmed':
      dispatch({ type: 'phase', agent: event.agent, animation: 'REVIEW' })
      dispatch({ type: 'tool', agent: event.agent, message: event.id + ' · ' + event.verdict })
      break
    case 'agent.completed':
      dispatch({ type: 'phase', agent: event.agent, animation: 'REPORT' })
      if (event.agent === 0) dispatch({ type: 'evidence', rows: auditRows(event.result) })
      else state.advice = adviceRows(event.result)
      break
    case 'handoff':
      handoff()
      break
    case 'review.completed':
      dispatch({ type: 'evidence', rows: auditRows(event.audit) })
      dispatch({ type: 'complete', rows: adviceRows(event.suggestions) })
      state.outcome = '审查完成'
      if (reduced()) idle()
      else finish = setTimeout(idle, 900)
      break
    case 'review.failed':
      if (event.partial && event.audit) dispatch({ type: 'evidence', rows: auditRows(event.audit) })
      idle()
      dispatch({ type: 'failure', message: reviewError(event.code), partial: event.partial })
      break
  }
}
async function startLive() {
  if (!props.snapshotId || running.value) return
  reset()
  const run = new AbortController()
  controller = run
  running.value = true
  state.outcome = '正在连接 AI 审查服务…'
  try {
    await streamReview(props.snapshotId, run.signal, event => {
      if (!run.signal.aborted) receive(event)
    })
  } catch (error) {
    idle()
    if (run.signal.aborted) state.outcome = '审查已取消'
    else dispatch({ type: 'failure', message: error instanceof Error ? error.message : '连接中断，请重试。', partial: !!state.audit })
  } finally {
    running.value = false
    controller = undefined
  }
}
function handoff() {
  dispatch({type:'handoff',state:'sending'})
  const done=()=>{
    dispatch({type:'handoff',state:'sent'})
    dispatch({type:'phase',agent:0,animation:'IDLE'})
  }
  if(reduced()) done()
  else transfer=setTimeout(done,800)
}
</script>
<template>
  <section class="section panel ag-work" aria-label="AI 协作审查">
    <div class="ag-head">
      <div><h2><span class="num">02 /</span>AI 协作审查</h2><p>README 真实性验证 · 综合修改建议</p></div>
      <div class="ag-actions">
        <button v-if="running" @click="controller?.abort()">取消审查</button>
        <button v-else class="primary" :disabled="!snapshotId" @click="startLive">开始 AI 审查</button>
      </div>
    </div>
    <div class="ag-flow">
      <AgentCard actor="clawd" :animation="state.actors[0]" />
      <div class="ag-handoff" :class="state.handoff"><span>JSON</span><div class="ag-wire"><i class="ag-packet"></i></div><span>{{ {waiting:'等待交接',sending:'正在交接',sent:'已交接'}[state.handoff] }}</span></div>
      <AgentCard actor="whale" :animation="state.actors[1]" />
    </div>
    <div class="ag-log">
      <div class="ag-loghead"><b>执行记录 <span class="ag-count">{{ state.logs.length }} events</span></b><span class="eyebrow" role="status">{{ state.outcome || 'IDLE · READ ONLY' }}</span></div>
      <div class="ag-loglines" role="log">
        <div v-if="!state.logs.length" class="muted">{{ snapshotId ? '等待开始审查。' : '此报告没有扫描快照，请重新扫描后开始审查。' }}</div>
        <div v-for="(item,index) in state.logs" :key="index" class="ag-line"><time>{{ String(index+1).padStart(2,'0') }}</time><span class="ag-who" :class="{b:item.source==='AGENT 02'}">{{ item.source }}</span><span>{{ item.message }}</span></div>
      </div>
    </div>
    <AgentResults :audit="state.audit" :advice="state.advice" />
    <div class="ag-bottom">依据当前扫描快照 · 静态评分沿用扫描报告 · 所有修改均未执行</div>
  </section>
</template>