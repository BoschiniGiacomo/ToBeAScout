import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useGame } from './GameContext';
import { BUILDINGS, TROOPS } from '../sim/content';
import { isBuildingUnlocked } from '../sim/buildings';
import { armyCampCapacity, armyHousingUsed, isTroopUnlocked } from '../sim/training';
import { formatResourceAmount, freeBuilderSlots, RESOURCE_PACKS } from '../sim/economy';
import { resolveBuildingSprite } from '../render/assets';
import type { Resources } from '../sim/types';

const LEGNA_ICON = require('../../assets/ui/resource_legna.png');
const ACQUA_ICON = require('../../assets/ui/resource_acqua.png');
const IMPEGNO_ICON = require('../../assets/ui/resource_impegno.png');
const TAB_EDIFICI = require('../../assets/ui/shop_tab_edifici.png');
const TAB_TRUPPE = require('../../assets/ui/shop_tab_truppe.png');
const TAB_RISORSE = require('../../assets/ui/shop_tab_risorse.png');

type ShopTab = 'edifici' | 'truppe' | 'risorse';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function CostRow({ cost }: { cost: Resources }) {
  return (
    <View style={styles.costRow}>
      {cost.legna > 0 ? (
        <View style={styles.costItem}>
          <Text style={styles.costNum}>{formatResourceAmount(cost.legna)}</Text>
          <Image source={LEGNA_ICON} style={styles.costIcon} />
        </View>
      ) : null}
      {cost.acqua > 0 ? (
        <View style={styles.costItem}>
          <Text style={styles.costNum}>{formatResourceAmount(cost.acqua)}</Text>
          <Image source={ACQUA_ICON} style={styles.costIcon} />
        </View>
      ) : null}
      {cost.impegno > 0 ? (
        <View style={styles.costItem}>
          <Text style={styles.costNum}>{formatResourceAmount(cost.impegno)}</Text>
          <Image source={IMPEGNO_ICON} style={styles.costIcon} />
        </View>
      ) : null}
      {cost.legna <= 0 && cost.acqua <= 0 && cost.impegno <= 0 ? (
        <Text style={styles.costNum}>Gratis</Text>
      ) : null}
    </View>
  );
}

/** Clash-of-Clans style shop modal. */
export function ShopSheet({ visible, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const { state, placementBuilding, setPlacementBuilding, train, setSelectedBuildingId, buyPack } =
    useGame();
  const [tab, setTab] = useState<ShopTab>('edifici');
  const builders = freeBuilderSlots(state, Date.now());
  const used = armyHousingUsed(state.army);
  const cap = armyCampCapacity(state);
  const unlockedBuildings = BUILDINGS.filter(
    (b) => b.id !== 'qg' && isBuildingUnlocked(state, b.id),
  );
  const unlockedTroops = TROOPS.filter((t) => isTroopUnlocked(state, t.id));

  const panelW = Math.min(width * 0.92, 720);
  const panelH = Math.min(height * 0.88, 420);
  const cardW = Math.max(132, Math.min(160, panelW * 0.22));

  const pickBuilding = (id: string) => {
    setSelectedBuildingId(null);
    setPlacementBuilding(placementBuilding === id ? null : id);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.panel, { width: panelW, height: panelH }]}>
          {/* Tab strip */}
          <View style={styles.tabStrip}>
            <View style={styles.tabsRow}>
              <Pressable
                style={[styles.tabImgBtn, tab === 'edifici' && styles.tabImgActive]}
                onPress={() => setTab('edifici')}
                accessibilityLabel="Edifici"
              >
                <Image source={TAB_EDIFICI} style={styles.tabImg} resizeMode="contain" />
              </Pressable>
              <Pressable
                style={[styles.tabImgBtn, tab === 'truppe' && styles.tabImgActive]}
                onPress={() => setTab('truppe')}
                accessibilityLabel="Esploratori"
              >
                <Image source={TAB_TRUPPE} style={styles.tabImg} resizeMode="contain" />
              </Pressable>
              <Pressable
                style={[styles.tabImgBtn, tab === 'risorse' && styles.tabImgActive]}
                onPress={() => setTab('risorse')}
                accessibilityLabel="Risorse"
              >
                <Image source={TAB_RISORSE} style={styles.tabImg} resizeMode="contain" />
              </Pressable>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Chiudi">
              <Text style={styles.closeX}>✕</Text>
            </Pressable>
          </View>

          {/* Content */}
          <View style={styles.body}>
            <Text style={styles.shopTitle}>
              {tab === 'edifici'
                ? 'Negozio Edifici'
                : tab === 'truppe'
                  ? 'Esploratori'
                  : 'Negozio Risorse'}
            </Text>

            {tab === 'edifici' ? (
              <ScrollView
                horizontal
                style={styles.cardsScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardsRow}
              >
                {unlockedBuildings.map((b) => {
                  const cost = b.levels[0].buildCost;
                  const sprite = resolveBuildingSprite(b.spriteKey, 1);
                  const active = placementBuilding === b.id;
                  return (
                    <Pressable
                      key={b.id}
                      style={[styles.card, { width: cardW }, active && styles.cardActive]}
                      onPress={() => pickBuilding(b.id)}
                    >
                      <Text style={styles.cardName} numberOfLines={2}>
                        {b.name}
                      </Text>
                      <View style={styles.cardArt}>
                        {sprite ? (
                          <Image source={sprite} style={styles.cardSprite} resizeMode="contain" />
                        ) : (
                          <View style={[styles.cardFallback, { backgroundColor: b.color }]} />
                        )}
                      </View>
                      <View style={styles.cardFooter}>
                        <CostRow cost={cost} />
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            {tab === 'truppe' ? (
              <ScrollView
                horizontal
                style={styles.cardsScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardsRow}
              >
                {unlockedTroops.length === 0 ? (
                  <Text style={styles.empty}>Nessuna truppa sbloccata</Text>
                ) : (
                  unlockedTroops.map((t) => (
                    <Pressable
                      key={t.id}
                      style={[styles.card, { width: cardW }]}
                      onPress={() => train(t.id)}
                    >
                      <Text style={styles.cardName} numberOfLines={2}>
                        {t.name}
                      </Text>
                      <View style={styles.cardArt}>
                        <View style={styles.troopBadge}>
                          <Text style={styles.troopBadgeText}>{t.housing}</Text>
                          <Text style={styles.troopBadgeSub}>posti</Text>
                        </View>
                      </View>
                      <View style={styles.cardFooter}>
                        <Text style={styles.trainMeta}>{t.trainTimeSec}s</Text>
                        <CostRow cost={t.trainCost} />
                      </View>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            ) : null}

            {tab === 'risorse' ? (
              <ScrollView
                horizontal
                style={styles.cardsScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.cardsRow}
              >
                {RESOURCE_PACKS.map((pack) => {
                  const canBuy = state.resources.impegno >= pack.costImpegno;
                  const icon = pack.grant.legna > 0 ? LEGNA_ICON : ACQUA_ICON;
                  const amount = pack.grant.legna > 0 ? pack.grant.legna : pack.grant.acqua;
                  return (
                    <Pressable
                      key={pack.id}
                      style={[styles.card, { width: cardW }, !canBuy && styles.cardDisabled]}
                      onPress={() => buyPack(pack.id)}
                    >
                      <Text style={styles.cardName} numberOfLines={2}>
                        {formatResourceAmount(amount)}{' '}
                        {pack.grant.legna > 0 ? 'Legna' : 'Acqua'}
                      </Text>
                      <View style={styles.cardArt}>
                        <Image source={icon} style={styles.resourcePackIcon} resizeMode="contain" />
                        <Text style={styles.packAmount}>{formatResourceAmount(amount)}</Text>
                      </View>
                      <View style={styles.cardFooter}>
                        <View style={styles.costItem}>
                          <Text style={styles.costNum}>{pack.costImpegno}</Text>
                          <Image source={IMPEGNO_ICON} style={styles.costIcon} />
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>

          {/* Bottom status */}
          <View style={styles.bottomBar}>
            {tab === 'edifici' ? (
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>Costruttori {builders}</Text>
              </View>
            ) : tab === 'truppe' ? (
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>
                  Esercito {used}/{cap}
                  {state.trainingQueue.length > 0
                    ? ` · coda ${state.trainingQueue.length}`
                    : ''}
                </Text>
              </View>
            ) : (
              <View style={styles.statusPill}>
                <Text style={styles.statusText}>Paga con Impegno</Text>
              </View>
            )}
            <View style={styles.walletRow}>
              <View style={styles.walletPill}>
                <Text style={styles.walletNum}>
                  {formatResourceAmount(state.resources.legna)}
                </Text>
                <Image source={LEGNA_ICON} style={styles.walletIcon} />
              </View>
              <View style={styles.walletPill}>
                <Text style={styles.walletNum}>
                  {formatResourceAmount(state.resources.acqua)}
                </Text>
                <Image source={ACQUA_ICON} style={styles.walletIcon} />
              </View>
              <View style={styles.walletPill}>
                <Text style={styles.walletNum}>
                  {formatResourceAmount(state.resources.impegno)}
                </Text>
                <Image source={IMPEGNO_ICON} style={styles.walletIcon} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  panel: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#5D4037',
    backgroundColor: '#2A2A2A',
    zIndex: 2,
  },
  tabStrip: {
    backgroundColor: '#E8DCC8',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingTop: 8,
    minHeight: 54,
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  tab: {
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#C4B59A',
    alignItems: 'center',
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: '#8D7B5E',
  },
  tabActive: {
    backgroundColor: '#3A3A3A',
    borderColor: '#F9A825',
    paddingBottom: 10,
    transform: [{ translateY: 2 }],
  },
  tabGlyph: { fontSize: 18, color: '#4E342E', fontWeight: '900' },
  tabGlyphOn: { color: '#FFE082' },
  tabLabel: { fontSize: 11, fontWeight: '800', color: '#4E342E', marginTop: 2 },
  tabLabelOn: { color: '#FFF8E1' },
  tabImgBtn: {
    marginBottom: 2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tabImgActive: {
    borderColor: '#F9A825',
    transform: [{ translateY: 2 }],
  },
  tabImg: {
    width: 56,
    height: 56,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginBottom: 6,
    borderWidth: 2,
    borderColor: '#B71C1C',
  },
  closeX: { color: '#FFF', fontWeight: '900', fontSize: 18 },
  body: {
    flex: 1,
    backgroundColor: '#2F2F2F',
    paddingTop: 8,
    paddingBottom: 4,
  },
  shopTitle: {
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  cardsScroll: {
    flex: 1,
  },
  cardsRow: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 12,
    alignItems: 'stretch',
    flexGrow: 1,
  },
  card: {
    backgroundColor: '#5BA3D9',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2E6FA0',
    flexDirection: 'column',
    alignSelf: 'stretch',
  },
  cardActive: {
    borderColor: '#FFF59D',
    borderWidth: 3,
  },
  cardDisabled: {
    opacity: 0.55,
  },
  resourcePackIcon: {
    width: 72,
    height: 72,
  },
  packAmount: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 16,
    marginTop: 4,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardName: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 4,
    flexShrink: 0,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardArt: {
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  cardSprite: { width: 88, height: 88 },
  cardFallback: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  troopBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 3,
    borderColor: '#FFF8E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  troopBadgeText: { color: '#FFF', fontWeight: '900', fontSize: 22 },
  troopBadgeSub: { color: '#E3F2FD', fontSize: 10, fontWeight: '700' },
  cardFooter: {
    flexShrink: 0,
    minHeight: 44,
    backgroundColor: 'rgba(20,20,20,0.85)',
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.25)',
  },
  trainMeta: { color: '#FFE082', fontSize: 11, fontWeight: '700' },
  costRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  costItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  costNum: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 12,
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  costIcon: { width: 16, height: 16 },
  empty: {
    color: '#FFF59D',
    fontWeight: '700',
    padding: 24,
    alignSelf: 'center',
  },
  bottomBar: {
    backgroundColor: '#7A8F3A',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 2,
    borderTopColor: '#5D6F2A',
  },
  statusPill: {
    backgroundColor: '#3E4A1C',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: { color: '#F1F8E9', fontWeight: '800', fontSize: 12 },
  walletRow: { flexDirection: 'row', gap: 6, flexShrink: 1 },
  walletPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#3E4A1C',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
  },
  walletNum: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  walletIcon: { width: 16, height: 16 },
});
