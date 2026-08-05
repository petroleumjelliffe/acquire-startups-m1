import { useNavigate } from 'react-router-dom';

export function OnlineLobbyPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-md rounded-xl bg-white p-8 shadow-xl">
        <h1 className="mb-1 text-center text-2xl font-bold">Play online</h1>
        <p className="mb-6 text-center text-sm text-gray-600">Everyone plays from their own device</p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => navigate('/online/create')}
            className="m-0 w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Create a room
          </button>
          <button
            type="button"
            onClick={() => navigate('/online/join')}
            className="m-0 w-full rounded-lg border border-gray-300 px-4 py-3 font-semibold hover:bg-gray-50"
          >
            Join with a code
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="m-0 w-full rounded-lg px-4 py-2 text-gray-600 hover:bg-gray-50"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
