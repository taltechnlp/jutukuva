// PM2 ecosystem file for Jutukuva server deployment
// Usage: pm2 start ecosystem.config.cjs

module.exports = {
	apps: [{
		name: 'jutukuva-server',
		script: './server.js',
		instances: 1,
		exec_mode: 'fork',
		autorestart: true,
		watch: false,
		max_memory_restart: '500M',
		env: {
			NODE_ENV: 'production',
			PORT: 1234,
			HOST: '127.0.0.1',
			ALLOWED_ORIGINS: '*'
		},
		error_file: './logs/error.log',
		out_file: './logs/out.log',
		log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
		merge_logs: true,
		// Auto-restart on file changes (useful for development)
		// watch: ['server.js', '../web-viewer/build'],
	}]
};
