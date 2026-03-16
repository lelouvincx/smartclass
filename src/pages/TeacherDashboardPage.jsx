import React from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function TeacherDashboardPage() {
  return (
    <div className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Teacher Dashboard</CardTitle>
          <CardDescription>Create and manage exercises for your students.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/teacher/exercises">Manage Exercises</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/teacher/exercises/new">Create Exercise</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
