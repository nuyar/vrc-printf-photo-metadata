#!/usr/bin/env python3
import http.server
import socketserver
import sys

PORT = 8001

class NoCacheHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

def run():
    try:
        with socketserver.TCPServer(("", PORT), NoCacheHTTPRequestHandler) as httpd:
            print(f"Starting server at http://localhost:{PORT}")
            print("Press Ctrl+C to stop.")
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 98: # Address already in use
            print(f"Port {PORT} is already in use. Please try another port or kill the existing process.")
        else:
            print(f"Error starting server: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nStopping server.")
        sys.exit(0)

if __name__ == "__main__":
    run()
