'use client'

import { useEffect, useRef } from 'react'

interface Props {
  labels:    string[]
  data:      number[]
  color:     string
  fillColor: string
}

const fmtVal = (n: number) => {
  if (n >= 1e6) return '₦' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '₦' + (n / 1e3).toFixed(0) + 'K'
  return '₦' + n
}

export default function MonthlyLineChart({ labels, data, color, fillColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef  = useRef<any>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const init = () => {
      const Chart = (window as any).Chart
      if (!Chart) return
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
      chartRef.current = new Chart(canvasRef.current, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label:           'Expenses',
            data,
            borderColor:     color,
            backgroundColor: fillColor,
            fill:            true,
            tension:         0.4,
            pointRadius:     4,
            pointBackgroundColor: color,
            pointBorderColor:    '#fff',
            pointBorderWidth:    2,
          }],
        },
        options: {
          responsive:          true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: (ctx: any) => ` Expenses: ${fmtVal(ctx.raw)}` },
            },
          },
          scales: {
            x: {
              ticks: { font: { size: 11 }, color: '#888' },
              grid:  { display: false },
            },
            y: {
              ticks: {
                callback: (v: any) => fmtVal(v),
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
      const script = document.createElement('script')
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js'
      script.onload = () => init()
      document.head.appendChild(script)
    } else {
      init()
    }
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [labels, data, color, fillColor])

  return (
    <div style={{ position: 'relative', height: '180px' }}>
      <canvas ref={canvasRef}
        role="img"
        aria-label={`Line chart showing monthly expense trend over ${labels.length} months`}>
        Expenses: {data.join(', ')}
      </canvas>
    </div>
  )
}
