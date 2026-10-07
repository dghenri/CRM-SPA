import 'dotenv/config';
import http from 'http';

import { app } from './src/app.js';
import { attachRealtime } from './src/lib/realtime.js';
import { PORT } from './src/lib/config.js';

const server = http.createServer(app);
attachRealtime(server); // WebSocket /ws (avisos em tempo real pra equipe)

server.listen(PORT, () => console.log(`Server running on port ${PORT} (HTTP + WebSocket)`));
