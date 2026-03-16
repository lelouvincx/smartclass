import React from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function StudentDashboardPage() {
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Student Dashboard</CardTitle>
          <CardDescription>Welcome to SmartClass</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Link
              to="/student/exercises"
              className="block rounded-lg border p-4 transition-colors hover:bg-muted"
            >
              <h3 className="font-medium">Browse Exercises</h3>
              <p className="mt-1 text-sm text-muted-foreground">View and start available exercises</p>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
