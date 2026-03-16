import React from "react";
import { View, Text, StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import type { Mosque } from "@live-azan/shared";

interface MosqueMapProps {
  mosques: Mosque[];
  userLocation: { latitude: number; longitude: number };
  onMosquePress: (mosque: Mosque) => void;
}

export function MosqueMap({
  mosques,
  userLocation,
  onMosquePress,
}: MosqueMapProps) {
  // Guard against zero/NaN coordinates which crash MapView
  const safeLat = isFinite(userLocation.latitude) && userLocation.latitude !== 0
    ? userLocation.latitude : 43.4643;  // fallback: Waterloo, ON
  const safeLon = isFinite(userLocation.longitude) && userLocation.longitude !== 0
    ? userLocation.longitude : -80.5204;

  const initialRegion = {
    latitude: safeLat,
    longitude: safeLon,
    latitudeDelta: 0.1,
    longitudeDelta: 0.1,
  };

  const validMosques = mosques.filter(
    (m) =>
      m.latitude != null &&
      m.longitude != null &&
      isFinite(m.latitude) &&
      isFinite(m.longitude) &&
      m.latitude !== 0 &&
      m.longitude !== 0
  );

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={initialRegion}
        showsUserLocation={userLocation.latitude !== 0}
        showsMyLocationButton={userLocation.latitude !== 0}
      >
        {validMosques.map((mosque) => (
          <Marker
            key={mosque.id}
            coordinate={{
              latitude: mosque.latitude,
              longitude: mosque.longitude,
            }}
            title={mosque.name}
            description={mosque.address}
            onPress={() => onMosquePress(mosque)}
            onCalloutPress={() => onMosquePress(mosque)}
            pinColor="#1B5E20"
          />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});
