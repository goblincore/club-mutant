import { useState, useEffect } from 'react'

interface Process {
  pid: number
  user: string
  cpu: number
  mem: number
  command: string
}

const INITIAL_PROCESSES: Process[] = [
  { pid: 1,   user: 'root',           cpu: 0.1,  mem: 0.5,  command: 'init' },
  { pid: 2,   user: 'root',           cpu: 0.0,  mem: 0.1,  command: 'kthreadd' },
  { pid: 234, user: 'victxrlarixs',   cpu: 1.2,  mem: 3.4,  command: 'cde-session' },
  { pid: 235, user: 'victxrlarixs',   cpu: 0.4,  mem: 1.2,  command: 'panel' },
  { pid: 236, user: 'victxrlarixs',   cpu: 0.8,  mem: 2.1,  command: 'filemanager' },
  { pid: 237, user: 'victxrlarixs',   cpu: 0.2,  mem: 0.8,  command: 'dtwm' },
  { pid: 238, user: 'victxrlarixs',   cpu: 5.4,  mem: 8.2,  command: 'netscape' },
  { pid: 239, user: 'victxrlarixs',   cpu: 0.0,  mem: 0.4,  command: 'dtcm' },
  { pid: 312, user: 'victxrlarixs',   cpu: 12.3, mem: 15.6, command: 'konpyuuta' },
  { pid: 400, user: 'www-data',       cpu: 0.1,  mem: 2.8,  command: 'apache2' },
]

function fluctuate(value: number, delta: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value + (Math.random() - 0.5) * delta))
}

export function ProcessMonitor() {
  const [processes, setProcesses] = useState<Process[]>(INITIAL_PROCESSES)
  const [selectedPid, setSelectedPid] = useState<number | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setProcesses(prev =>
        prev.map(p => ({
          ...p,
          cpu: fluctuate(p.cpu, 1.0),
          mem: fluctuate(p.mem, 0.3),
        }))
      )
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const totalCpu = processes.reduce((s, p) => s + p.cpu, 0)
  const totalMem = processes.reduce((s, p) => s + p.mem, 0)

  function isSystemProcess(p: Process) {
    return p.user === 'root' || p.user === 'www-data'
  }

  return (
    <div className="pm-root">
      <div className="pm-header">
        <div className="pm-stat">
          <span className="pm-stat-label">CPU:</span>
          <span className="pm-cpu-bar-container">
            <span
              className="pm-cpu-bar-fill"
              style={{ width: `${Math.min(100, totalCpu)}%` }}
            />
          </span>
          <span className="pm-stat-value cpu-bar">{totalCpu.toFixed(1)}%</span>
        </div>
        <div className="pm-stat">
          <span className="pm-stat-label">Mem:</span>
          <span className="pm-mem-bar-container">
            <span
              className="pm-mem-bar-fill"
              style={{ width: `${Math.min(100, totalMem)}%` }}
            />
          </span>
          <span className="pm-stat-value mem-bar">{totalMem.toFixed(1)}%</span>
        </div>
        <div className="pm-stat">
          <span className="pm-stat-label">Tasks:</span>
          <span className="pm-stat-value">{processes.length}</span>
        </div>
      </div>

      <div className="pm-table-header">
        <span className="pm-col-pid">PID</span>
        <span className="pm-col-user">USER</span>
        <span className="pm-col-cpu">%CPU</span>
        <span className="pm-col-mem">%MEM</span>
        <span className="pm-col-cmd">COMMAND</span>
      </div>

      <div className="pm-process-list">
        {processes
          .slice()
          .sort((a, b) => b.cpu - a.cpu)
          .map(p => (
            <div
              key={p.pid}
              className={[
                'pm-process-row',
                selectedPid === p.pid ? 'selected' : '',
                isSystemProcess(p) ? 'system-process' : 'user-process',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setSelectedPid(p.pid === selectedPid ? null : p.pid)}
            >
              <span className="pm-col-pid">{p.pid}</span>
              <span className="pm-col-user">{p.user}</span>
              <span className="pm-col-cpu">{p.cpu.toFixed(1)}</span>
              <span className="pm-col-mem">{p.mem.toFixed(1)}</span>
              <span className="pm-col-cmd">{p.command}</span>
            </div>
          ))}
      </div>

      <div className="pm-help-line help-line">
        F1Help  F2Setup  F3Search  F4Filter  F5Tree  F6SortBy  F9Kill  F10Quit
      </div>
    </div>
  )
}
