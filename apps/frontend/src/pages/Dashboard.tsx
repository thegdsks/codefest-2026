import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'
import type { DashboardResponse } from '../lib/types'
import type { ApiResult } from '../lib/types'

type DashboardResult = ApiResult<DashboardResponse>

export default function Dashboard() {
  const [result, setResult] = useState<DashboardResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<DashboardResponse>('/dashboard?userId=USER%23001').then((res) => {
      setResult(res)
      setLoading(false)
    })
  }, [])

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Dashboard</h1>
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {loading && (
          <p className="text-sm text-gray-500">Loading...</p>
        )}

        {!loading && result !== null && result.error !== null && (
          <p className="text-sm text-red-600">
            Error {result.error.code}: {result.error.message}
          </p>
        )}

        {!loading && result !== null && result.error === null && (
          <pre className="text-xs text-gray-800 overflow-x-auto whitespace-pre-wrap break-words">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}
