import React, { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  clearCrashLog,
  getCrashLog,
  logCrash,
  subscribeCrashLog,
  type CrashEntry,
} from './crashLog';

interface BoundaryProps {
  children: ReactNode;
  name?: string;
}

interface BoundaryState {
  error: CrashEntry | null;
}

export class CrashErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return {
      error: {
        id: 'pending',
        at: new Date().toISOString(),
        kind: 'react',
        where: 'ErrorBoundary',
        message: error.message,
        stack: error.stack,
      },
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const entry = logCrash('react', this.props.name ?? 'ErrorBoundary', error, {
      componentStack: info.componentStack?.slice(0, 800),
    });
    this.setState({ error: entry });
  }

  render() {
    if (this.state.error) {
      return (
        <CrashScreen
          entry={this.state.error}
          onDismiss={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function CrashScreen({ entry, onDismiss }: { entry: CrashEntry; onDismiss: () => void }) {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Crash catturato</Text>
      <Text style={styles.meta}>
        {entry.kind} · {entry.where}
      </Text>
      <ScrollView style={styles.box}>
        <Text style={styles.msg}>{entry.message}</Text>
        {entry.stack ? <Text style={styles.stack}>{entry.stack}</Text> : null}
      </ScrollView>
      <Text style={styles.hint}>Dettagli anche nel terminale Metro (TOBEASCOUT CRASH)</Text>
      <Pressable style={styles.btn} onPress={onDismiss}>
        <Text style={styles.btnText}>Riprova schermata</Text>
      </Pressable>
    </View>
  );
}

/** Floating badge that shows latest crash count; tap to open list. */
export function CrashLogOverlay() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CrashEntry[]>(getCrashLog);

  useEffect(() => subscribeCrashLog((_e, all) => setItems(all)), []);

  if (items.length === 0 && !open) return null;

  if (open) {
    return (
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.title}>Log crash ({items.length})</Text>
          <ScrollView style={{ maxHeight: 220 }}>
            {[...items].reverse().map((e) => (
              <View key={e.id} style={styles.item}>
                <Text style={styles.meta}>
                  {e.kind} · {e.where} · {e.at.slice(11, 19)}
                </Text>
                <Text style={styles.msg}>{e.message}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.row}>
            <Pressable
              style={styles.btn}
              onPress={() => {
                clearCrashLog();
                setItems([]);
              }}
            >
              <Text style={styles.btnText}>Pulisci</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.secondary]} onPress={() => setOpen(false)}>
              <Text style={styles.btnText}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={styles.badge} onPress={() => setOpen(true)}>
      <Text style={styles.badgeText}>CRASH {items.length}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#3E2723',
    padding: 16,
    justifyContent: 'center',
    gap: 10,
  },
  title: { color: '#FFECB3', fontSize: 18, fontWeight: '800' },
  meta: { color: '#FFCC80', fontSize: 12 },
  box: {
    maxHeight: 180,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    padding: 10,
  },
  msg: { color: '#FFF8E1', fontSize: 13, fontWeight: '600' },
  stack: { color: '#BCAAA4', fontSize: 10, marginTop: 8 },
  hint: { color: '#FFE0B2', fontSize: 11 },
  btn: {
    backgroundColor: '#E65100',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    flex: 1,
  },
  secondary: { backgroundColor: '#5D4037' },
  btnText: { color: '#FFF', fontWeight: '800' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 9999,
  },
  panel: {
    backgroundColor: '#263238',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  item: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#546E7A',
    paddingVertical: 8,
  },
  row: { flexDirection: 'row', gap: 8 },
  badge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: '#C62828',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    zIndex: 9998,
  },
  badgeText: { color: '#FFF', fontWeight: '800', fontSize: 11 },
});
