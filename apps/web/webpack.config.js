import path from 'path';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import webpack from 'webpack';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webConfig = {
  entry: './src/main.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.[contenthash].js',
    chunkFilename: 'chunk.[name].[contenthash].js',
    publicPath: '/',
    clean: true,
  },
  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      maxSize: 240 * 1024,
      cacheGroups: {
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
          name: 'react-vendor',
          priority: 30,
          enforce: true,
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          priority: 20,
          reuseExistingChunk: true,
        },
        common: {
          minChunks: 2,
          name: 'common',
          priority: 10,
          reuseExistingChunk: true,
        },
      },
    },
  },
  performance: {
    // Keep every cacheable asset small while allowing the expected aggregate
    // startup cost of React, routing, and Better Auth for this authenticated SPA.
    maxAssetSize: 244 * 1024,
    maxEntrypointSize: 450 * 1024,
    hints: 'warning',
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.app.json',
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        // Emitted as hashed files so photos stay out of the JS bundle and cache forever.
        test: /\.(png|jpe?g|webp|svg)$/i,
        type: 'asset/resource',
        generator: { filename: 'assets/[name].[contenthash:8][ext]' },
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      __TMS_API_BASE_URL__: JSON.stringify(process.env.TMS_API_BASE_URL || 'http://localhost:3001/api'),
      __TMS_PUSH_USE_NATIVE_ROUTES__: JSON.stringify(process.env.TMS_PUSH_NATIVE_WEB_ROUTES === 'true'),
      __TMS_FIREBASE_WEB_CONFIG__: JSON.stringify({
        apiKey: process.env.TMS_FIREBASE_API_KEY || '',
        appId: process.env.TMS_FIREBASE_APP_ID || '',
        projectId: process.env.TMS_FIREBASE_PROJECT_ID || '',
        messagingSenderId: process.env.TMS_FIREBASE_MESSAGING_SENDER_ID || '',
        authDomain: process.env.TMS_FIREBASE_AUTH_DOMAIN || '',
        vapidKey: process.env.TMS_FIREBASE_WEB_VAPID_KEY || '',
      }),
    }),
    new HtmlWebpackPlugin({
      template: './index.html',
    }),
  ],
  devServer: {
    port: 5173,
    historyApiFallback: true,
    hot: true,
  },
};

// A separate bundled worker avoids loading a remote CDN and is not an SPA route.
const workerConfig = {
  ...webConfig,
  entry: './src/firebase-messaging-sw.ts',
  output: { ...webConfig.output, filename: 'firebase-messaging-sw.js', clean: false },
  target: 'webworker',
  devServer: undefined,
  optimization: { splitChunks: false, runtimeChunk: false },
  plugins: [webConfig.plugins[0]],
  dependencies: ['web'],
};
webConfig.name = 'web';
workerConfig.name = 'messaging-worker';
export default [webConfig, workerConfig];
