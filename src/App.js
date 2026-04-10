import Chat from './components/Chat';

function App() {
  return (
    <div className="h-screen bg-gray-200 flex items-center justify-center">
      
      <div className="w-full max-w-4xl h-full sm:h-[90vh] shadow-lg rounded-lg overflow-hidden bg-white">
        <Chat />
      </div>

    </div>
  );
}

export default App;