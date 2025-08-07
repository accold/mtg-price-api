import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { Server, PlayCircle, Book, Lightbulb, Bolt, Gem, Shield, Feather, Leaf, Sparkles } from "lucide-react";

const EXAMPLE_CARDS = [
  { name: "Lightning Bolt", description: "Classic red instant", icon: Bolt, color: "red" },
  { name: "Black Lotus", description: "Legendary artifact", icon: Gem, color: "gray" },
  { name: "Counterspell", description: "Blue instant", icon: Shield, color: "blue" },
  { name: "Serra Angel", description: "White creature", icon: Feather, color: "yellow" },
  { name: "Llanowar Elves", description: "Green creature", icon: Leaf, color: "green" },
  { name: "Sol Ring", description: "Colorless artifact", icon: Sparkles, color: "purple" },
];

export default function Home() {
  const [cardName, setCardName] = useState("");
  const [shouldFetch, setShouldFetch] = useState(false);

  const { data: response, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/card", cardName],
    enabled: shouldFetch && cardName.trim().length > 0,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async () => {
      const encodedCard = encodeURIComponent(cardName.trim());
      const res = await fetch(`/api/card?card=${encodedCard}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText);
      }
      
      return res.text();
    }
  });

  const handleSubmit = () => {
    if (cardName.trim()) {
      setShouldFetch(true);
      refetch();
    }
  };

  const handleExampleClick = (name: string) => {
    setCardName(name);
  };

  const getStatusDisplay = () => {
    if (isLoading) {
      return (
        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded flex items-center">
          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse mr-1"></div>
          Loading
        </span>
      );
    }
    
    if (error) {
      const errorMessage = error.message;
      if (errorMessage.includes("Missing 'card'")) {
        return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">400 Bad Request</span>;
      }
      if (errorMessage.includes("Card not found")) {
        return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">404 Not Found</span>;
      }
      return <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">500 Server Error</span>;
    }
    
    if (response) {
      return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">200 OK</span>;
    }
    
    return <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded">Ready</span>;
  };

  const getResponseText = () => {
    if (isLoading) {
      return "Making request to Scryfall API...";
    }
    
    if (error) {
      return error.message;
    }
    
    if (response) {
      return response;
    }
    
    return `Waiting for request...

Example response:
----------------------------------------
Card: Lightning Bolt
Set: M11
USD Price: $0.25
Foil Price: $2.50
----------------------------------------`;
  };

  return (
    <div className="bg-api-background font-sans min-h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="bg-api-primary p-2 rounded-lg">
                <Server className="text-white text-xl w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Scryfall Card API Server</h1>
                <p className="text-sm text-api-secondary">Express.js endpoint for Magic: The Gathering card data</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 bg-api-success/10 px-3 py-1 rounded-full">
              <div className="w-2 h-2 bg-api-success rounded-full animate-pulse"></div>
              <span className="text-sm font-medium text-api-success">Server Running</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* API Tester */}
        <Card className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <PlayCircle className="text-api-primary mr-2 w-5 h-5" />
              API Endpoint Tester
            </h2>
            <p className="text-sm text-api-secondary mt-1">Test the card lookup endpoint with live data from Scryfall</p>
          </div>
          
          <CardContent className="p-6 space-y-6">
            {/* Request Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-md font-medium text-gray-900">Request</h3>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">GET</span>
                  <span className="text-sm text-api-secondary font-mono">http://localhost:5000/api/card</span>
                </div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="cardName" className="block text-sm font-medium text-gray-700 mb-2">
                    Card Name
                    <span className="text-api-secondary font-normal"> (query parameter: ?card=)</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="text"
                      id="cardName"
                      data-testid="input-card-name"
                      placeholder="Enter card name (e.g., Lightning Bolt, Black Lotus)"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-api-primary focus:border-api-primary transition-colors bg-white text-gray-900 pr-10"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <Sparkles className="text-gray-400 w-4 h-4" />
                    </div>
                  </div>
                </div>
                
                <Button
                  onClick={handleSubmit}
                  data-testid="button-send-request"
                  className="w-full bg-api-primary hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2"
                  disabled={isLoading}
                >
                  <PlayCircle className="w-4 h-4" />
                  <span>Send Request</span>
                </Button>
              </div>
            </div>

            {/* Response Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-md font-medium text-gray-900">Response</h3>
                <div data-testid="response-status">
                  {getStatusDisplay()}
                </div>
              </div>
              
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                <pre data-testid="response-output" className="text-gray-300 whitespace-pre-wrap">
                  {getResponseText()}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Documentation */}
        <Card className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Book className="text-api-primary mr-2 w-5 h-5" />
              API Documentation
            </h2>
          </div>
          
          <CardContent className="p-6 space-y-6">
            {/* Endpoint Details */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900">Endpoint Details</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-start space-x-3">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded mt-0.5">GET</span>
                  <div className="flex-1">
                    <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">/api/card</code>
                    <p className="text-sm text-api-secondary mt-1">Fetches Magic: The Gathering card data from Scryfall API</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Parameters */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900">Query Parameters</h3>
              <div className="overflow-x-auto">
                <table className="w-full border border-gray-200 rounded-lg">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">Parameter</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">Required</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr>
                      <td className="px-4 py-3 text-sm font-mono text-gray-900">card</td>
                      <td className="px-4 py-3 text-sm text-gray-600">string</td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">Required</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">Name of the Magic: The Gathering card to lookup</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Response Format */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900">Response Format</h3>
              <div className="bg-gray-900 rounded-lg p-4">
                <pre className="text-gray-300 font-mono text-sm">
{`Content-Type: text/plain

Card: {card_name}
Set: {set_code}
USD Price: ${'{usd_price}'}
Foil Price: ${'{foil_price}'}`}
                </pre>
              </div>
            </div>

            {/* Error Responses */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900">Error Responses</h3>
              <div className="space-y-3">
                <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">400</span>
                    <span className="text-sm font-medium text-red-900">Bad Request</span>
                  </div>
                  <code className="text-sm text-red-700 font-mono">Error: Missing 'card' query parameter</code>
                </div>
                
                <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">404</span>
                    <span className="text-sm font-medium text-red-900">Not Found</span>
                  </div>
                  <code className="text-sm text-red-700 font-mono">Error: Card not found</code>
                </div>
                
                <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">500</span>
                    <span className="text-sm font-medium text-red-900">Server Error</span>
                  </div>
                  <code className="text-sm text-red-700 font-mono">Error: API request failed</code>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nightbot Integration */}
        <Card className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-purple-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <svg className="w-5 h-5 mr-2 text-purple-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7v10c0 5.55 3.84 9.01 9 9.01s9-3.46 9-9.01V7l-10-5z"/>
              </svg>
              Nightbot Integration for Twitch
            </h2>
            <p className="text-sm text-gray-600 mt-1">Set up card price lookup commands for your Twitch chat</p>
          </div>
          
          <CardContent className="p-6 space-y-6">
            {/* Setup Instructions */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900">Setup Instructions</h3>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-medium">1</span>
                  <div>
                    <p className="text-sm text-gray-700 font-medium">Go to Nightbot.tv and sign in with your Twitch account</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-medium">2</span>
                  <div>
                    <p className="text-sm text-gray-700 font-medium">Go to Commands → Custom Commands → Add Command</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-medium">3</span>
                  <div>
                    <p className="text-sm text-gray-700 font-medium">Use the command setup below</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Command Configuration */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900">Command Configuration</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Command Name</label>
                  <code className="block bg-gray-900 text-green-400 p-3 rounded font-mono text-sm">!card</code>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                  <code className="block bg-gray-900 text-green-400 p-3 rounded font-mono text-sm break-all">
                    $(urlfetch http://localhost:5000/api/nightbot?card=$(querystring))
                  </code>
                  <p className="text-xs text-gray-500 mt-1">Replace localhost:5000 with your deployed URL</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">User Level</label>
                  <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">Everyone</span>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cooldown</label>
                  <span className="inline-block bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-sm">5 seconds</span>
                </div>
              </div>
            </div>

            {/* Usage Examples */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900">Chat Usage Examples</h3>
              <div className="space-y-3">
                <div className="bg-gray-900 rounded p-3 font-mono text-sm">
                  <div className="text-purple-400">viewer:</div>
                  <div className="text-white ml-4">!card Lightning Bolt</div>
                  <div className="text-green-400 mt-1">nightbot:</div>
                  <div className="text-gray-300 ml-4">Lightning Bolt (M11) - $0.25 | Foil: $2.50</div>
                </div>
                <div className="bg-gray-900 rounded p-3 font-mono text-sm">
                  <div className="text-purple-400">viewer:</div>
                  <div className="text-white ml-4">!card Black Lotus</div>
                  <div className="text-green-400 mt-1">nightbot:</div>
                  <div className="text-gray-300 ml-4">Black Lotus (LEA) - $35000.00 | Foil: N/A</div>
                </div>
              </div>
            </div>

            {/* API Endpoint */}
            <div className="space-y-4">
              <h3 className="text-md font-semibold text-gray-900">Nightbot API Endpoint</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-start space-x-3">
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-medium rounded mt-0.5">GET</span>
                  <div className="flex-1">
                    <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">/api/nightbot</code>
                    <p className="text-sm text-api-secondary mt-1">Optimized for Twitch chat with shorter response format</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Example Cards */}
        <Card className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Lightbulb className="text-api-warning mr-2 w-5 h-5" />
              Example Cards to Try
            </h2>
          </div>
          
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {EXAMPLE_CARDS.map((card) => {
                const IconComponent = card.icon;
                return (
                  <Button
                    key={card.name}
                    variant="outline"
                    onClick={() => handleExampleClick(card.name)}
                    data-testid={`button-example-${card.name.toLowerCase().replace(' ', '-')}`}
                    className="p-4 border border-gray-200 rounded-lg hover:border-api-primary hover:bg-blue-50 transition-colors text-left group h-auto justify-start"
                  >
                    <div className="flex items-center space-x-3 w-full">
                      <div className={`w-10 h-10 bg-${card.color}-100 rounded-lg flex items-center justify-center group-hover:bg-${card.color}-200 transition-colors`}>
                        <IconComponent className={`text-${card.color}-600 w-4 h-4`} />
                      </div>
                      <div className="text-left">
                        <h4 className="font-medium text-gray-900">{card.name}</h4>
                        <p className="text-xs text-api-secondary">{card.description}</p>
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-api-secondary">
          <p>
            Powered by{' '}
            <a href="https://scryfall.com" className="text-api-primary hover:underline" target="_blank" rel="noopener noreferrer">
              Scryfall API
            </a>
            {' '}• Built with Express.js
          </p>
        </footer>
      </div>
    </div>
  );
}
