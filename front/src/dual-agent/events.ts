import { reactive } from 'vue'
export type Agent = 0 | 1
export type Animation = 'IDLE' | 'SCAN' | 'REVIEW' | 'REPORT'
export type Row = {status:string; tone:string; claim:string; file:string; evidence?:string; note?:string; why?:string; verification?:string; diff?:{path:string; startLine:number; lines:{kind:"add"|"remove"; line:number; content:string}[]}}
export type AgentEvent =
  | {type:'phase'; agent:Agent; animation:Animation}
  | {type:'tool'; agent:Agent; message:string}
  | {type:'evidence'; rows:Row[]}
  | {type:'handoff'; state:'sending'|'sent'}
  | {type:'complete'; rows:Row[]}
  | {type:'failure'; message:string; partial:boolean}
export function createReview() {
  const state = reactive({
    actors: ['IDLE','IDLE'] as [Animation, Animation],
    logs: [] as {source:string; message:string}[],
    audit: null as Row[] | null,
    advice: null as Row[] | null,
    handoff: 'waiting' as 'waiting' | 'sending' | 'sent',
    outcome: '',
  })
  function dispatch(event: AgentEvent) {
    switch(event.type) {
      case 'phase': state.actors[event.agent] = event.animation; break
      case 'tool': state.logs.push({source: 'AGENT 0' + (event.agent + 1), message:event.message}); break
      case 'evidence': state.audit = event.rows; state.logs.push({source:'AGENT 01',message:'记录 '+event.rows.length+' 项证据结论'}); break
      case 'handoff':
        state.handoff = event.state
        if(event.state === 'sending') state.logs.push({source:'SYS',message:'handoff(audit.json + scan.json)'})
        break
      case 'complete': state.advice = event.rows; state.outcome = '审查完成'; break
      case 'failure': state.outcome = (event.partial ? '部分完成' : '失败') + ' · ' + event.message; break
    }
  }
  return {state, dispatch}
}