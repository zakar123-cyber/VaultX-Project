// Écran des paramètres de l'application
// Ici on peut changer le thème, gérer les catégories et les groupes

import React, { useState } from 'react';
import { ScrollView, StyleSheet, View, Alert, TouchableOpacity, Text } from 'react-native';
import { ThemedView, ThemedText, ThemedButton, ThemedSwitch, ThemedCard, ThemedInput, useThemeColors } from '../components/ThemedComponents';
import { ThemedModal } from '../components/ThemedModal';
import { useSettings, GROUP_ICONS } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useVault } from '../context/VaultContext'; // Import useVault
import { useNavigation } from '@react-navigation/native';
import { spacing, borderRadius } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';

// Liste des icônes disponibles pour les catégories et groupes
const ICONS = ['folder', 'lock-closed', 'card', 'mail', 'document-text', 'key', 'wallet', 'globe', 'person', 'briefcase', 'home', 'car', 'airplane', 'laptop', 'phone-portrait'];

// Types de champs disponibles pour les catégories
const FIELD_TYPES = [
    { id: 'text', name: 'Texte', icon: 'text' },
    { id: 'password', name: 'Mot de passe', icon: 'eye-off' },
    { id: 'multiline', name: 'Notes', icon: 'document-text' },
    { id: 'date', name: 'Date', icon: 'calendar' },
    { id: 'number', name: 'Nombre', icon: 'calculator' },
];

export default function SettingsScreen() {
    const colors = useThemeColors();
    const {
        isDarkMode,
        toggleTheme,
        categories,
        addCategory,
        updateCategory,
        deleteCategory,
        groups,
        addGroup,
        updateGroup,
        deleteGroup,
        isBiometricsEnabled,
        toggleBiometrics,
        isAutoBackupEnabled,
        toggleAutoBackup
    } = useSettings();
    const { cloudUser, isCloudAuthenticated, promptGoogleLogin, cloudLogout } = useAuth();
    const { triggerAutoBackup } = useVault(); // Get trigger function
    const navigation = useNavigation();

    const handleAutoBackupToggle = (value) => {
        if (value) {
            // Turning ON
            if (!isCloudAuthenticated) {
                // ... login prompt ...
                Alert.alert(
                    "Authentification Requise",
                    "Connectez-vous avec Google pour activer la sauvegarde dans le cloud.",
                    [
                        { text: "Annuler", style: "cancel" },
                        { text: "Se connecter (Google)", onPress: () => promptGoogleLogin() }
                    ]
                );
                return;
            }
            toggleAutoBackup(true);

            // IMMEDIATE ACTION: Trigger backup now!
            triggerAutoBackup();

            Alert.alert("Succès", "Sauvegarde automatique activée (Synchronisation lancée).");
        } else {
            // Turning OFF
            toggleAutoBackup(false);
        }
    };

    const handleBiometricToggle = async (value) => {
        // Common checks for hardware
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        // Check strictly for FINGERPRINT if user wants "only fingerprint"
        // usage: types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        const hasFingerprint = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT);

        if (!hasHardware || !hasFingerprint) {
            Alert.alert("Erreur", "L'authentification par empreinte n'est pas disponible sur cet appareil.");
            return;
        }

        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!isEnrolled) {
            Alert.alert("Erreur", "Aucune empreinte enregistrée sur cet appareil.");
            return;
        }

        if (value) {
            // Turning ON -> Just enable (since we verified hardware exists)
            toggleBiometrics(true);
        } else {
            // Turning OFF -> REQUIRE VERIFICATION (Fingerprint Only)
            try {
                const result = await LocalAuthentication.authenticateAsync({
                    promptMessage: "Confirmez votre empreinte pour désactiver",
                    disableDeviceFallback: true, // Strickly no PIN/Pattern
                    cancelLabel: "Annuler"
                });

                if (result.success) {
                    toggleBiometrics(false);
                } else {
                    // Start of error handling
                    // If user cancels, we just do nothing (switch stays ON).
                    // We only show alert if it's a specific error the user should know about?
                    // User complained about "desactivation annuler".
                    // If they just hit cancel, silence is golden?
                    // But if it fails for other reasons, show it.
                    if (result.error !== 'user_cancel' && result.error !== 'system_cancel') {
                        Alert.alert("Erreur", "Authentification échouée. Impossible de désactiver.");
                    }
                }
            } catch (e) {
                console.error("Bio Error", e);
                Alert.alert("Erreur", "Erreur technique lors de l'authentification.");
            }
        }
    };

    // États pour le popup de gestion des catégories
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [categoryName, setCategoryName] = useState('');
    const [categoryIcon, setCategoryIcon] = useState('folder');
    const [categoryFields, setCategoryFields] = useState([]);

    // États pour le popup de gestion des groupes
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null);
    const [groupName, setGroupName] = useState('');
    const [groupIcon, setGroupIcon] = useState('folder');

    // États pour le popup d'ajout/modification de champ
    const [showFieldModal, setShowFieldModal] = useState(false);
    const [editingFieldIndex, setEditingFieldIndex] = useState(null);
    const [fieldName, setFieldName] = useState('');
    const [fieldType, setFieldType] = useState('text');
    const [fieldSensitive, setFieldSensitive] = useState(false);

    // Ouvre le popup pour créer ou modifier une catégorie
    const handleOpenCategoryModal = (category = null) => {
        if (category) {
            // Mode modification - on remplit avec les données existantes
            setEditingCategory(category);
            setCategoryName(category.name);
            setCategoryIcon(category.icon);
            setCategoryFields(category.fields || []);
        } else {
            // Mode création - on remet tout à zéro
            setEditingCategory(null);
            setCategoryName('');
            setCategoryIcon('folder');
            setCategoryFields([
                { id: 'notes', name: 'Notes', type: 'multiline' },
            ]);
        }
        setShowCategoryModal(true);
    };

    // Sauvegarde la catégorie (création ou modification)
    const handleSaveCategory = () => {
        if (!categoryName.trim()) {
            Alert.alert('Erreur', 'Le nom de la catégorie est obligatoire');
            return;
        }
        if (categoryFields.length === 0) {
            Alert.alert('Erreur', 'Ajoutez au moins un champ');
            return;
        }

        const categoryData = {
            name: categoryName,
            icon: categoryIcon,
            fields: categoryFields,
        };

        if (editingCategory) {
            updateCategory(editingCategory.id, categoryData);
        } else {
            addCategory(categoryData);
        }
        setShowCategoryModal(false);
    };

    const handleDeleteCategory = (id) => {
        Alert.alert('Delete Category', 'Are you sure? This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(id) },
        ]);
    };

    // Field handlers
    const handleOpenFieldModal = (index = null) => {
        if (index !== null) {
            const field = categoryFields[index];
            setEditingFieldIndex(index);
            setFieldName(field.name);
            setFieldType(field.type);
            setFieldSensitive(field.sensitive || false);
        } else {
            setEditingFieldIndex(null);
            setFieldName('');
            setFieldType('text');
            setFieldSensitive(false);
        }
        setShowFieldModal(true);
    };

    const handleSaveField = () => {
        if (!fieldName.trim()) {
            Alert.alert('Error', 'Field name is required');
            return;
        }

        const fieldData = {
            id: fieldName.toLowerCase().replace(/\s+/g, '_'),
            name: fieldName,
            type: fieldType,
            sensitive: fieldSensitive,
        };

        if (editingFieldIndex !== null) {
            const newFields = [...categoryFields];
            newFields[editingFieldIndex] = fieldData;
            setCategoryFields(newFields);
        } else {
            setCategoryFields([...categoryFields, fieldData]);
        }
        setShowFieldModal(false);
    };

    const handleDeleteField = (index) => {
        const newFields = categoryFields.filter((_, i) => i !== index);
        setCategoryFields(newFields);
    };

    // Group handlers
    const handleOpenGroupModal = (group = null) => {
        if (group) {
            setEditingGroup(group);
            setGroupName(group.name);
            setGroupIcon(group.icon || 'folder');
        } else {
            setEditingGroup(null);
            setGroupName('');
            setGroupIcon('folder');
        }
        setShowGroupModal(true);
    };

    const handleSaveGroup = () => {
        if (!groupName.trim()) {
            Alert.alert('Error', 'Group name is required');
            return;
        }
        if (editingGroup) {
            updateGroup(editingGroup.id, groupName, groupIcon);
        } else {
            addGroup(groupName, groupIcon);
        }
        setShowGroupModal(false);
    };

    const handleDeleteGroup = (id) => {
        Alert.alert('Delete Group', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteGroup(id) },
        ]);
    };

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
                {/* Appearance Section */}
                <ThemedText type="subHeader" style={styles.sectionTitle}>Appearance</ThemedText>
                <ThemedCard>
                    <ThemedSwitch
                        label={isDarkMode ? "🌙 Dark Mode" : "☀️ Light Mode"}
                        value={isDarkMode}
                        onValueChange={toggleTheme}
                    />
                </ThemedCard>

                {/* Security Section */}
                <ThemedText type="subHeader" style={styles.sectionTitle}>Sécurité</ThemedText>
                <ThemedCard>
                    <ThemedSwitch
                        label={isBiometricsEnabled ? "🔒 Biométrie activée" : "🔓 Biométrie désactivée"}
                        value={isBiometricsEnabled}
                        onValueChange={handleBiometricToggle}
                    />
                </ThemedCard>

                {/* Backup Section */}
                <ThemedText type="subHeader" style={styles.sectionTitle}>Sauvegarde</ThemedText>
                <ThemedCard>
                    <ThemedSwitch
                        label={isAutoBackupEnabled ? "☁️ Sauvegarde Auto (Activée)" : "☁️ Sauvegarde Auto (Désactivée)"}
                        value={isAutoBackupEnabled}
                        onValueChange={handleAutoBackupToggle}
                    />
                    <TouchableOpacity
                        style={{ marginTop: spacing.m, paddingTop: spacing.m, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' }}
                        onPress={() => {
                            if (isCloudAuthenticated) {
                                Alert.alert("Compte Cloud", `Connecté en tant que: ${cloudUser.email}`, [
                                    { text: "Fermer" },
                                    { text: "Se déconnecter", style: "destructive", onPress: cloudLogout }
                                ]);
                            } else {
                                promptGoogleLogin();
                            }
                        }}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <ThemedText>{isCloudAuthenticated ? "Gérer le compte (Connecté)" : "Se connecter (Google)"}</ThemedText>
                            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                        </View>
                    </TouchableOpacity>
                </ThemedCard>

                {/* Categories Section */}
                <View style={styles.sectionHeader}>
                    <ThemedText type="subHeader" style={styles.sectionTitle}>Categories</ThemedText>
                    <TouchableOpacity
                        style={[styles.addButton, { backgroundColor: colors.primary }]}
                        onPress={() => handleOpenCategoryModal()}
                    >
                        <Ionicons name="add" size={20} color={colors.primaryText} />
                        <Text style={[styles.addButtonText, { color: colors.primaryText }]}>Add</Text>
                    </TouchableOpacity>
                </View>

                {categories.map((category) => (
                    <ThemedCard key={category.id} style={styles.listItem}>
                        <View style={styles.listItemContent}>
                            <View style={[styles.iconBadge, { backgroundColor: colors.blue }]}>
                                <Ionicons name={category.icon} size={20} color="#FFFFFF" />
                            </View>
                            <View style={styles.itemInfo}>
                                <ThemedText style={styles.itemName}>{category.name}</ThemedText>
                                <ThemedText style={[styles.itemMeta, { color: colors.textSecondary }]}>
                                    {category.fields?.length || 0} fields
                                </ThemedText>
                            </View>
                        </View>
                        <View style={styles.listItemActions}>
                            <TouchableOpacity
                                style={[styles.iconAction, { backgroundColor: colors.card, borderColor: colors.border }]}
                                onPress={() => handleOpenCategoryModal(category)}
                            >
                                <Ionicons name="pencil" size={18} color={colors.blue} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.iconAction, { backgroundColor: colors.card, borderColor: colors.border }]}
                                onPress={() => handleDeleteCategory(category.id)}
                            >
                                <Ionicons name="trash" size={18} color={colors.danger} />
                            </TouchableOpacity>
                        </View>
                    </ThemedCard>
                ))}

                {/* Groups Section */}
                <View style={[styles.sectionHeader, { marginTop: spacing.l }]}>
                    <ThemedText type="subHeader" style={styles.sectionTitle}>Groups</ThemedText>
                    <TouchableOpacity
                        style={[styles.addButton, { backgroundColor: colors.primary }]}
                        onPress={() => handleOpenGroupModal()}
                    >
                        <Ionicons name="add" size={20} color={colors.primaryText} />
                        <Text style={[styles.addButtonText, { color: colors.primaryText }]}>Add</Text>
                    </TouchableOpacity>
                </View>

                {groups.map((group) => (
                    <ThemedCard key={group.id} style={styles.listItem}>
                        <View style={styles.listItemContent}>
                            <View style={[styles.iconBadge, { backgroundColor: colors.success }]}>
                                <Ionicons name={group.icon || 'folder'} size={20} color="#FFFFFF" />
                            </View>
                            <ThemedText style={styles.itemName}>{group.name}</ThemedText>
                        </View>
                        <View style={styles.listItemActions}>
                            <TouchableOpacity
                                style={[styles.iconAction, { backgroundColor: colors.card, borderColor: colors.border }]}
                                onPress={() => handleOpenGroupModal(group)}
                            >
                                <Ionicons name="pencil" size={18} color={colors.blue} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.iconAction, { backgroundColor: colors.card, borderColor: colors.border }]}
                                onPress={() => handleDeleteGroup(group.id)}
                            >
                                <Ionicons name="trash" size={18} color={colors.danger} />
                            </TouchableOpacity>
                        </View>
                    </ThemedCard>
                ))}
            </ScrollView>

            {/* Category Modal */}
            <ThemedModal visible={showCategoryModal} onClose={() => setShowCategoryModal(false)} size="large">
                <ThemedText type="header" style={styles.modalTitle}>
                    {editingCategory ? 'Edit Category' : 'New Category'}
                </ThemedText>

                <ThemedInput
                    label="Category Name"
                    value={categoryName}
                    onChangeText={setCategoryName}
                    placeholder="e.g., Bank Account"
                />

                <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Icon</ThemedText>
                <View style={styles.iconGrid}>
                    {ICONS.map((icon) => (
                        <TouchableOpacity
                            key={icon}
                            style={[
                                styles.iconOption,
                                {
                                    borderColor: colors.border,
                                    backgroundColor: categoryIcon === icon ? colors.blue : colors.card,
                                }
                            ]}
                            onPress={() => setCategoryIcon(icon)}
                        >
                            <Ionicons name={icon} size={22} color={categoryIcon === icon ? '#FFFFFF' : colors.text} />
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={styles.fieldsHeader}>
                    <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Fields</ThemedText>
                    <TouchableOpacity
                        style={[styles.smallAddButton, { backgroundColor: colors.blue }]}
                        onPress={() => handleOpenFieldModal()}
                    >
                        <Ionicons name="add" size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>

                {categoryFields.map((field, index) => (
                    <View key={index} style={[styles.fieldItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={styles.fieldInfo}>
                            <Ionicons
                                name={FIELD_TYPES.find(t => t.id === field.type)?.icon || 'text'}
                                size={18}
                                color={colors.textSecondary}
                            />
                            <ThemedText style={styles.fieldName}>{field.name}</ThemedText>
                            <ThemedText style={[styles.fieldType, { color: colors.textSecondary }]}>
                                ({field.type})
                            </ThemedText>
                            {field.sensitive && (
                                <Ionicons name="eye" size={16} color={colors.blue} />
                            )}
                        </View>
                        <View style={styles.fieldActions}>
                            <TouchableOpacity onPress={() => handleOpenFieldModal(index)}>
                                <Ionicons name="pencil" size={18} color={colors.blue} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteField(index)}>
                                <Ionicons name="trash" size={18} color={colors.danger} />
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}

                <View style={styles.modalActions}>
                    <ThemedButton
                        title="Cancel"
                        variant="secondary"
                        onPress={() => setShowCategoryModal(false)}
                        style={styles.modalButton}
                    />
                    <ThemedButton
                        title="Save"
                        onPress={handleSaveCategory}
                        style={styles.modalButton}
                    />
                </View>
            </ThemedModal>

            {/* Field Modal */}
            <ThemedModal visible={showFieldModal} onClose={() => setShowFieldModal(false)} size="small">
                <ThemedText type="subHeader" style={styles.modalTitle}>
                    {editingFieldIndex !== null ? 'Edit Field' : 'New Field'}
                </ThemedText>

                <ThemedInput
                    label="Field Name"
                    value={fieldName}
                    onChangeText={setFieldName}
                    placeholder="e.g., Account Number"
                />

                <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Field Type</ThemedText>
                <View style={styles.typeGrid}>
                    {FIELD_TYPES.map((type) => (
                        <TouchableOpacity
                            key={type.id}
                            style={[
                                styles.typeOption,
                                {
                                    borderColor: colors.border,
                                    backgroundColor: fieldType === type.id ? colors.blue : colors.card,
                                }
                            ]}
                            onPress={() => setFieldType(type.id)}
                        >
                            <Ionicons name={type.icon} size={18} color={fieldType === type.id ? '#FFFFFF' : colors.text} />
                            <ThemedText style={[
                                styles.typeLabel,
                                { color: fieldType === type.id ? '#FFFFFF' : colors.text }
                            ]}>
                                {type.name}
                            </ThemedText>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Sensitive Toggle */}
                <TouchableOpacity
                    style={[
                        styles.sensitiveToggle,
                        {
                            borderColor: colors.border,
                            backgroundColor: fieldSensitive ? colors.blue : colors.card,
                        }
                    ]}
                    onPress={() => setFieldSensitive(!fieldSensitive)}
                >
                    <Ionicons
                        name={fieldSensitive ? "eye" : "eye-off"}
                        size={20}
                        color={fieldSensitive ? '#FFFFFF' : colors.textSecondary}
                    />
                    <View style={styles.sensitiveInfo}>
                        <ThemedText style={[
                            styles.sensitiveLabel,
                            { color: fieldSensitive ? '#FFFFFF' : colors.text }
                        ]}>
                            Show/Hide Toggle
                        </ThemedText>
                        <ThemedText style={[
                            styles.sensitiveHint,
                            { color: fieldSensitive ? 'rgba(255,255,255,0.7)' : colors.textSecondary }
                        ]}>
                            Enable magic eye to hide/show this field
                        </ThemedText>
                    </View>
                    <View style={[
                        styles.checkbox,
                        {
                            borderColor: fieldSensitive ? '#FFFFFF' : colors.border,
                            backgroundColor: fieldSensitive ? '#FFFFFF' : 'transparent',
                        }
                    ]}>
                        {fieldSensitive && <Ionicons name="checkmark" size={14} color={colors.blue} />}
                    </View>
                </TouchableOpacity>

                <View style={styles.modalActions}>
                    <ThemedButton
                        title="Cancel"
                        variant="secondary"
                        onPress={() => setShowFieldModal(false)}
                        style={styles.modalButton}
                    />
                    <ThemedButton
                        title="Save"
                        onPress={handleSaveField}
                        style={styles.modalButton}
                    />
                </View>
            </ThemedModal>

            {/* Group Modal */}
            <ThemedModal visible={showGroupModal} onClose={() => setShowGroupModal(false)} size="medium">
                <ThemedText type="header" style={styles.modalTitle}>
                    {editingGroup ? 'Edit Group' : 'New Group'}
                </ThemedText>

                <ThemedInput
                    label="Group Name"
                    value={groupName}
                    onChangeText={setGroupName}
                    placeholder="e.g., Personal"
                />

                <ThemedText style={[styles.label, { color: colors.textSecondary }]}>Icon</ThemedText>
                <View style={styles.iconGrid}>
                    {(GROUP_ICONS || ICONS).map((icon) => (
                        <TouchableOpacity
                            key={icon}
                            style={[
                                styles.iconOption,
                                {
                                    borderColor: colors.border,
                                    backgroundColor: groupIcon === icon ? colors.success : colors.card,
                                }
                            ]}
                            onPress={() => setGroupIcon(icon)}
                        >
                            <Ionicons name={icon} size={22} color={groupIcon === icon ? '#FFFFFF' : colors.text} />
                        </TouchableOpacity>
                    ))}
                </View>

                <View style={styles.modalActions}>
                    <ThemedButton
                        title="Cancel"
                        variant="secondary"
                        onPress={() => setShowGroupModal(false)}
                        style={styles.modalButton}
                    />
                    <ThemedButton
                        title="Save"
                        onPress={handleSaveGroup}
                        style={styles.modalButton}
                    />
                </View>
            </ThemedModal>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        padding: spacing.m,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.m,
    },
    sectionTitle: {
        marginBottom: spacing.s,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: spacing.s,
        paddingHorizontal: spacing.m,
        borderRadius: borderRadius.pill,
        gap: 4,
    },
    addButtonText: {
        fontWeight: 'bold',
        fontSize: 14,
    },
    listItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    listItemContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: spacing.m,
    },
    itemInfo: {
        flex: 1,
    },
    itemName: {
        fontSize: 16,
        fontWeight: '500',
    },
    itemMeta: {
        fontSize: 12,
        marginTop: 2,
    },
    listItemActions: {
        flexDirection: 'row',
        gap: spacing.s,
    },
    iconAction: {
        width: 36,
        height: 36,
        borderRadius: borderRadius.m,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalTitle: {
        marginBottom: spacing.l,
        textAlign: 'center',
    },
    label: {
        marginBottom: spacing.s,
        fontSize: 14,
        fontWeight: '500',
    },
    iconGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.s,
        marginBottom: spacing.l,
    },
    iconOption: {
        width: 44,
        height: 44,
        borderRadius: borderRadius.m,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fieldsHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: spacing.s,
    },
    smallAddButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    fieldItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: spacing.m,
        borderRadius: borderRadius.m,
        borderWidth: 1,
        marginBottom: spacing.s,
    },
    fieldInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.s,
        flex: 1,
    },
    fieldName: {
        fontSize: 14,
    },
    fieldType: {
        fontSize: 12,
    },
    fieldActions: {
        flexDirection: 'row',
        gap: spacing.m,
    },
    typeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.s,
        marginBottom: spacing.l,
    },
    typeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.s,
        paddingHorizontal: spacing.m,
        borderRadius: borderRadius.m,
        borderWidth: 1,
        gap: spacing.xs,
    },
    sensitiveToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.m,
        borderRadius: borderRadius.m,
        borderWidth: 1,
        marginBottom: spacing.m,
        gap: spacing.m,
    },
    sensitiveInfo: {
        flex: 1,
    },
    sensitiveLabel: {
        fontSize: 14,
        fontWeight: '500',
    },
    sensitiveHint: {
        fontSize: 12,
        marginTop: 2,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 4,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    typeLabel: {
        fontSize: 12,
        fontWeight: '500',
    },
    modalActions: {
        flexDirection: 'row',
        gap: spacing.m,
        marginTop: spacing.m,
    },
    modalButton: {
        flex: 1,
    },
});
