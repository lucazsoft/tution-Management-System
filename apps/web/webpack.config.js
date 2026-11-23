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
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      __TMS_PUSH_USE_NATIVE_ROUTES__: false,
      __TMS_FIREBASE_WEB_CONFIG__: JSON.stringify({apiKey:process.env.TMS_FIREBASE_API_KEY||'',appId:process.env.TMS_FIREBASE_APP_ID||'',projectId:process.env.TMS_FIREBASE_PROJECT_ID||'',messagingSenderId:process.env.TMS_FIREBASE_MESSAGING_SENDER_ID||'',authDomain:process.env.TMS_FIREBASE_AUTH_DOMAIN||'',vapidKey:process.env.TMS_FIREBASE_WEB_VAPID_KEY||''}),
      __TMS_API_BASE_URL__: JSON.stringify(process.env.TMS_API_BASE_URL || 'http://localhost:3001/api'),
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

webConfig.name = 'web';
const worker = {...webConfig, name:'messaging-worker', entry:'./src/firebase-messaging-sw.ts',
  output:{...webConfig.output,filename:'firebase-messaging-sw.js',clean:false},target:'webworker',
  optimization:{splitChunks:false,runtimeChunk:false},plugins:[webConfig.plugins[0]],dependencies:['web'],devServer:undefined};
const diagnostic = {...webConfig,name:'push-test',entry:'./src/push-test.ts',
  output:{...webConfig.output,filename:'push-test.js',clean:false},
  optimization:{splitChunks:false,runtimeChunk:false},plugins:[webConfig.plugins[0],new HtmlWebpackPlugin({filename:'push-test.html',template:'./push-test.html'})],dependencies:['web'],devServer:undefined};
export default [webConfig,worker,diagnostic];
