'use client'

import { useEffect, useRef } from 'react'

interface Dataset {
  label: string
  data: number[]
  color: string
}

interface Props {
  labels: string[]
  datasets: Dataset[]
  isCount?: boolean
}

const fmtVal = (n: number, isCount?: boolean) => {
  if (isCount) return n.toString()
  if (n >= 1e6) return '₦' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '₦' + (n / 1e3).toFixed(0) + 'K'
  return '₦' + n
}

export default function MonthlyBarChart({ labels, datasets, isCount }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    let Chart: any
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
    script.onload = () => {
      Chart = (window as any).Chart
      if (!Chart) return
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
      chartRef.current = new Chart(canvasRef.current, {
        type: 'bar',
        data: {
          labels,
          datasets: datasets.map(ds => ({
            label:           ds.label,
            data:            ds.data,
            backgroundColor: ds.color,
            borderRadius:    4,
            borderSkipped:   false,
          })),
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx: any) => ` ${ctx.dataset.label}: ${fmtVal(ctx.raw, isCount)}`,
              },
            },
          },
          scales: {
            x: {
              ticks: { font: { size: 11 }, color: '#888' },
              grid:  { display: false },
            },
            y: {
              ticks: {
                callback: (v: any) => fmtVal(v, isCount),
                font: { size: 11 },
                color: '#888',
                maxTicksLimit: 5,
              },
              grid: { color: 'rgba(128,128,128,0.08)' },
            },
          },
        },
      })
    }
    if (!(window as any).Chart) {
      document.head.appendChild(script)
    } else {
      script.onload(null as any)
    }
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [labels, datasets, isCount])

  return (
    <div style={{ position: 'relative', height: '180px' }}>
      <canvas ref={canvasRef}
        role="img"
        aria-label={`Bar chart showing ${datasets.map(d => d.label).join(' and ')} over ${labels.length} months`}>
        {datasets.map(d => d.label + ': ' + d.data.join(', ')).join('. ')}
      </canvas>
    </div>
  )
}
