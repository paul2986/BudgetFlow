
import { Redirect } from 'expo-router';

// This route is deprecated - redirecting to home
export default function AuthCallback() {
  return <Redirect href="/" />;
}
