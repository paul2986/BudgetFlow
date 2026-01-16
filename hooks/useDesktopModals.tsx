
import React, { createContext, useContext, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import Modal from '../components/Modal';
import ExpenseForm from '../components/forms/ExpenseForm';
import PersonForm from '../components/forms/PersonForm';
import BudgetSwitcherModal from '../components/modals/BudgetSwitcherModal';

type ModalType = 'add-expense' | 'edit-expense' | 'edit-person' | 'budgets' | null;

interface DesktopModalsContextType {
    openModal: (type: ModalType, id?: string) => void;
    closeModal: () => void;
}

const DesktopModalsContext = createContext<DesktopModalsContextType | undefined>(undefined);

export function DesktopModalsProvider({ children }: { children: React.ReactNode }) {
    const [modalType, setModalType] = useState<ModalType>(null);
    const [activeId, setActiveId] = useState<string | undefined>(undefined);

    const openModal = useCallback((type: ModalType, id?: string) => {
        if (Platform.OS === 'web') {
            setModalType(type);
            setActiveId(id);
        }
    }, []);

    const closeModal = useCallback(() => {
        setModalType(null);
        setActiveId(undefined);
    }, []);

    return (
        <DesktopModalsContext.Provider value={{ openModal, closeModal }}>
            {children}

            {/* Desktop Modals */}
            {Platform.OS === 'web' && (
                <>
                    <Modal
                        visible={modalType === 'add-expense' || modalType === 'edit-expense'}
                        onClose={closeModal}
                        title={modalType === 'edit-expense' ? 'Edit Expense' : 'Add Expense'}
                    >
                        <ExpenseForm id={activeId} onClose={closeModal} />
                    </Modal>

                    <Modal
                        visible={modalType === 'edit-person'}
                        onClose={closeModal}
                        title="Edit Person"
                    >
                        <PersonForm personId={activeId} onClose={closeModal} />
                    </Modal>

                    <BudgetSwitcherModal
                        visible={modalType === 'budgets'}
                        onClose={closeModal}
                    />
                </>
            )}
        </DesktopModalsContext.Provider>
    );
}

export function useDesktopModals() {
    const context = useContext(DesktopModalsContext);
    if (context === undefined) {
        throw new Error('useDesktopModals must be used within a DesktopModalsProvider');
    }
    return context;
}
