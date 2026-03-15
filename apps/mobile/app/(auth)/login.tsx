import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "../../stores/authStore";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, oauthLogin, isLoading } = useAuthStore();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password.");
      return;
    }
    try {
      await login(email, password);
    } catch (err: any) {
      Alert.alert("Login Failed", err.message || "Unable to sign in.");
    }
  };

  const handleOAuth = async (provider: "GOOGLE" | "APPLE" | "MICROSOFT") => {
    try {
      await oauthLogin(provider, "", "", "");
    } catch (err: any) {
      Alert.alert("Login Failed", err.message || "Unable to sign in.");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>LiveAzan</Text>
        <Text style={styles.subtitle}>Prayer times for your mosque</Text>

        <TouchableOpacity
          style={[styles.oauthButton, styles.googleButton]}
          onPress={() => handleOAuth("GOOGLE")}
          disabled={isLoading}
        >
          <Ionicons name="logo-google" size={20} color="#fff" />
          <Text style={styles.oauthText}>Sign in with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.oauthButton, styles.appleButton]}
          onPress={() => handleOAuth("APPLE")}
          disabled={isLoading}
        >
          <Ionicons name="logo-apple" size={20} color="#fff" />
          <Text style={styles.oauthText}>Sign in with Apple</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.oauthButton, styles.microsoftButton]}
          onPress={() => handleOAuth("MICROSOFT")}
          disabled={isLoading}
        >
          <Ionicons name="logo-microsoft" size={20} color="#fff" />
          <Text style={styles.oauthText}>Sign in with Microsoft</Text>
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity
          style={styles.loginButton}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.loginButtonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/register" style={styles.link}>
          <Text style={styles.linkText}>
            Don't have an account? <Text style={styles.linkBold}>Sign up</Text>
          </Text>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: "700",
    color: "#1B5E20",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
  },
  oauthButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
    gap: 10,
  },
  googleButton: {
    backgroundColor: "#DB4437",
  },
  appleButton: {
    backgroundColor: "#000",
  },
  microsoftButton: {
    backgroundColor: "#0078D4",
  },
  oauthText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#ddd",
  },
  dividerText: {
    marginHorizontal: 12,
    color: "#999",
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: "#fafafa",
  },
  loginButton: {
    backgroundColor: "#1B5E20",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 4,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  link: {
    marginTop: 20,
    alignSelf: "center",
  },
  linkText: {
    fontSize: 14,
    color: "#666",
  },
  linkBold: {
    color: "#1B5E20",
    fontWeight: "600",
  },
});
