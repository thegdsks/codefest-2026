'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { ApiResult, DashboardResponse } from '@/lib/types';

type DashboardResult = ApiResult<DashboardResponse>;

export default function DashboardPage() {
  const [result, setResult] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<DashboardResponse>('/dashboard?userId=USER%23001').then((res) => {
      setResult(res);
      setLoading(false);
    });
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Dashboard</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {loading && <p className="text-sm text-gray-500">Loading...</p>}

        {!loading && result !== null && result.error !== null && (
          <p className="text-sm text-red-600">
            Error {result.error.code}: {result.error.message}
          </p>
        )}

        {!loading && result !== null && result.error === null && (
          <>
            <div className="mb-4 text-sm text-gray-700">
              Points balance:{' '}
              <span data-signal="points_balance" className="font-semibold text-blue-700">
                {result.data.user.pointsBalance.toLocaleString()} pts
              </span>
            </div>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-gray-800">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
