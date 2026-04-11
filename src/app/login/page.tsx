import LoginForm from '@/components/LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-green-700 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">⚽</div>
          <h1 className="text-3xl font-bold text-white">Fantacalcio</h1>
          <p className="text-green-200 mt-2">Accedi alla tua lega</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
