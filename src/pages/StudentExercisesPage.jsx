import React, { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { listExercises } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

export default function StudentExercisesPage() {
  const navigate = useNavigate()

  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadExercises() {
    setIsLoading(true)
    setError('')

    try {
      const response = await listExercises()
      setItems(response.data || [])
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadExercises()
  }, [])

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Exercises</h1>
            <p className="text-sm text-muted-foreground">Browse and start exercises</p>
          </div>
          <Button variant="outline" size="icon" onClick={loadExercises} aria-label="Refresh exercises">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </Card>

      <Card>
        {isLoading && (
          <p className="p-5 text-sm text-muted-foreground">Loading exercises...</p>
        )}

        {!isLoading && error && (
          <p className="p-5 text-sm text-destructive">{error}</p>
        )}

        {!isLoading && !error && items.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No exercises yet. Check back soon!</p>
          </div>
        )}

        {!isLoading && !error && items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Questions</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{item.title}</td>
                    <td className="px-4 py-3">
                      {item.is_timed ? (
                        <span>
                          <Badge variant="default" className="mr-2">Timed</Badge>
                          {item.duration_minutes} min
                        </span>
                      ) : (
                        <Badge variant="secondary">Untimed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">{item.question_count}</td>
                    <td className="px-4 py-3">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => navigate(`/student/exercises/${item.id}`)}
                      >
                        Start
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
