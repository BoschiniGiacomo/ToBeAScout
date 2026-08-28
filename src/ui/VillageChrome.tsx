import React from 'react';
import { Link } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useGame } from './GameContext';
import { getBuildingDef, getEraDef } from '../sim/content';

const SHOP_ICON = require('../../assets/ui/shop_button.png');
const MISSIONS_ICON = require('../../assets/ui/missions_button.png');

type Props = {
  onOpenShop: () => void;
  onCancelPlace: () => void;
};

/** Clash-style bottom chrome: missions left, shop right. */
export function VillageChrome({ onOpenShop, onCancelPlace }: Props) {
  const { state, placementBuilding, movingBuildingId } = useGame();
  const era = getEraDef(state.currentEra);
  const interacting = !!(placementBuilding || movingBuildingId);
  const movingDef = movingBuildingId
    ? getBuildingDef(
        state.buildings.find((b) => b.instanceId === movingBuildingId)?.buildingId ?? 'qg',
      )
    : null;

  return (
    <>
      <View style={styles.topLeft} pointerEvents="none">
        <Text style={styles.era}>{era.name}</Text>
      </View>

      {interacting ? (
        <View style={styles.cancelWrap} pointerEvents="box-none">
          <Pressable style={styles.cancelPlace} onPress={onCancelPlace}>
            <Text style={styles.cancelPlaceText}>
              {movingBuildingId ? 'Annulla spostamento' : 'Annulla'}
            </Text>
          </Pressable>
          {movingDef ? (
            <Text style={styles.moveHint}>Spostando: {movingDef.name}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.bottomBar} pointerEvents="box-none">
        <Link href="/missions" asChild>
          <Pressable
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Missioni"
          >
            <Image source={MISSIONS_ICON} style={styles.hudIcon} resizeMode="contain" />
          </Pressable>
        </Link>

        <Pressable
          style={styles.iconBtn}
          onPress={onOpenShop}
          accessibilityRole="button"
          accessibilityLabel="Shop"
        >
          <Image source={SHOP_ICON} style={styles.hudIcon} resizeMode="contain" />
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  topLeft: {
    position: 'absolute',
    top: 10,
    left: 12,
    zIndex: 40,
    alignItems: 'flex-start',
  },
  era: {
    color: '#FFF59D',
    fontSize: 13,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 60,
  },
  iconBtn: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  hudIcon: {
    width: 86,
    height: 86,
  },
  cancelWrap: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 55,
  },
  cancelPlace: {
    width: 108,
    backgroundColor: '#5D4037',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFE0B2',
  },
  cancelPlaceText: { color: '#FFE0B2', fontWeight: '800' },
  moveHint: {
    marginTop: 8,
    color: '#FFF59D',
    fontSize: 12,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
