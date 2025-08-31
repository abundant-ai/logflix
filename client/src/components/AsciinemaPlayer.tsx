import { useEffect, useRef } from "react";

interface AsciinemaPlayerProps {
  castContent: string;
}

export default function AsciinemaPlayer({ castContent }: AsciinemaPlayerProps) {
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playerRef.current || !castContent) return;

    // Load asciinema-player dynamically
    const loadPlayer = async () => {
      try {
        // Import asciinema-player
        const AsciinemaPlayer = await import('asciinema-player');
        
        // Clear any existing content
        if (playerRef.current) {
          playerRef.current.innerHTML = '';
        }

        // Parse the cast content to create a data URL
        const castData = castContent;
        const blob = new Blob([castData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create the player
        if (playerRef.current) {
          AsciinemaPlayer.create(url, playerRef.current, {
            cols: 160,
            rows: 40,
            autoPlay: false,
            loop: false,
            theme: 'monokai',
            fontSize: '12px',
            lineHeight: 1.33,
            fit: 'width',
          });
        }

        // Clean up the blob URL
        return () => URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to load asciinema-player:', error);
        
        // Fallback: display raw terminal content
        if (playerRef.current) {
          const lines = castContent.split('\n');
          const terminalContent = lines
            .filter(line => {
              try {
                const parsed = JSON.parse(line);
                return Array.isArray(parsed) && parsed[1] === 'o';
              } catch {
                return false;
              }
            })
            .map(line => {
              try {
                const parsed = JSON.parse(line);
                return parsed[2];
              } catch {
                return '';
              }
            })
            .join('');

          playerRef.current.innerHTML = `
            <div class="bg-black text-green-400 font-mono text-sm p-4 rounded-lg min-h-96 overflow-auto">
              <div class="whitespace-pre-wrap">${terminalContent || 'Terminal session data available but player failed to load'}</div>
              <div class="mt-4 text-gray-500 text-xs">
                Note: Install asciinema-player for full terminal playback experience
              </div>
            </div>
          `;
        }
      }
    };

    loadPlayer();
  }, [castContent]);

  return (
    <div className="w-full">
      <div 
        ref={playerRef} 
        className="asciinema-player bg-black rounded-lg min-h-96"
        data-testid="asciinema-player"
      />
    </div>
  );
}
